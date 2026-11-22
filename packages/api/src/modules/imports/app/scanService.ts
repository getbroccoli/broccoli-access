import { ApplicationError } from "../../../core/applicationError";
import {
  type ConnectionUpdate,
  type Connector,
  ConnectorError,
  type ConnectorErrorCode,
  type ConnectorRegistry,
  type ImportedAccount,
  withConnectorRetries,
} from "../../../core/connectors";
import type { Orm, Transact, Tx } from "../../../core/db";
import type { JobQueue } from "../../../core/jobs";
import { createSetupStepService } from "../../../core/instance";
import type { Logger } from "../../../core/logger";
import type { SecurityContext } from "../../../core/security";
import { importSourceRepository } from "../db";
import { type Scan, type ScanCounts, type ScanProgress, scanOf } from "../domain";
import type { DirectoryPeople, ScannedApps } from "../ports";
import { readChangedPhotos } from "./readChangedPhotos";
import { type ScanFindings, syncAccounts } from "./syncAccounts";

const setupSteps = createSetupStepService();

/** Scans of connected apps: queued in the caller's transaction, run as a job, read by the scan page. */
export interface ScanService {
  /**
   * Marks the connection's source scanning, creating it named `sourceName` on the first scan, and
   * queues the scan's job, joining `tx`. While a scan of the connection is queued or running, it
   * queues nothing more. Needs MANAGE_WORKSPACE; refuses an unknown connection with NOT_FOUND.
   */
  scanConnection: (
    ctx: SecurityContext,
    tx: Tx,
    scan: { connectionId: string; sourceName: string },
  ) => Promise<{ sourceId: string }>;
  /**
   * "Scan now": queues a scan of the connection as `scanConnection` does, in its own transaction,
   * and returns the scan, now scanning. Needs MANAGE_WORKSPACE; refuses a connection never scanned
   * with NOT_FOUND.
   */
  scanNow: (ctx: SecurityContext, connectionId: string) => Promise<Scan>;
  /**
   * The scan's job: reads every page of the connection's accounts and a directory's changed
   * photos, trying a rate-limited or unavailable call again, then in one transaction replaces the
   * source's records, syncs them, marks it scanned and moves setup from the scan to selecting the
   * apps. Settings or secrets a page renews are saved before its accounts are used. A connector
   * error reading the accounts marks it failed and changes nothing else; one reading a photo only
   * keeps that person's photo as it is. System only.
   */
  runScan: (ctx: SecurityContext, sourceId: string) => Promise<void>;
  /** The job's attempts are used up: the scan failed with `app_unavailable`. System only. */
  failScan: (ctx: SecurityContext, sourceId: string) => Promise<void>;
  /** The connection's scan as the scan page shows it; null before the first. Needs MANAGE_WORKSPACE. */
  readScan: (ctx: SecurityContext, connectionId: string) => Promise<Scan | null>;
  /**
   * The email of the member whose key or session the connection uses, from its last saved scan;
   * null before one. Needs MANAGE_WORKSPACE.
   */
  readConnectionUserEmail: (ctx: SecurityContext, connectionId: string) => Promise<string | null>;
}

export interface ScanDependencies {
  orm: Orm;
  transact: Transact;
  logger: Logger;
  jobs: JobQueue;
  /** Every connector a connection may name. */
  connectors: ConnectorRegistry;
  apps: ScannedApps;
  directory: DirectoryPeople;
  /** Waits between attempts of a call; tests pass one that does not wait. */
  wait?: (ms: number) => Promise<void>;
}

export function createScanService(dependencies: ScanDependencies): ScanService {
  const { orm, transact, logger, jobs, apps } = dependencies;
  // shortcut: progress lives in this process, so a restart loses it and the page falls back to the
  // source's status; keep it in Postgres if the API ever runs as more than one process.
  const progressBySource = new Map<string, ScanProgress>();
  const service: ScanService = {
    async scanConnection(ctx, tx, { connectionId, sourceName }) {
      ctx.require("MANAGE_WORKSPACE");
      const connection = await apps.readConnectionById(tx, connectionId);
      if (!connection) {
        throw new ApplicationError("NOT_FOUND", "No app connection has this id.");
      }
      const sources = importSourceRepository(tx);
      const source = await sources.lockByConnection(connectionId);
      if (source?.status === "scanning") {
        return { sourceId: source.id };
      }
      let sourceId = source?.id;
      if (sourceId) {
        await sources.markScanning(sourceId);
      } else {
        sourceId = (await sources.insertScanning({ connectionId, name: sourceName })).id;
      }
      await jobs.send(tx, SCAN_JOB, { sourceId });
      return { sourceId };
    },
    async scanNow(ctx, connectionId) {
      ctx.require("MANAGE_WORKSPACE");
      const { sourceId } = await transact(async (tx) => {
        const source = await importSourceRepository(tx).findByConnection(connectionId);
        if (!source) {
          throw new ApplicationError("NOT_FOUND", "No app connection has this id.");
        }
        return service.scanConnection(ctx, tx, { connectionId, sourceName: source.name });
      });
      logger.info({ connectionId, sourceId }, "Scan now requested");
      return (await service.readScan(ctx, connectionId))!;
    },
    async runScan(ctx, sourceId) {
      ctx.requireSystem();
      const source = await importSourceRepository(orm).findById(sourceId);
      if (source?.status !== "scanning") {
        logger.info({ sourceId, status: source?.status ?? null }, "Scan skipped: not queued");
        return;
      }
      progressBySource.set(sourceId, { found: null });
      try {
        await scanSource(
          ctx,
          dependencies,
          { sourceId, connectionId: source.connectionId },
          progressBySource,
        );
      } catch (error) {
        if (!(error instanceof ConnectorError)) {
          throw error;
        }
        await markFailed(transact, sourceId, error.code);
        logger.warn({ sourceId, failure: error.code }, "Scan failed");
      } finally {
        progressBySource.delete(sourceId);
      }
    },
    async failScan(ctx, sourceId) {
      ctx.requireSystem();
      await markFailed(transact, sourceId, "app_unavailable");
      logger.warn({ sourceId, failure: "app_unavailable" }, "Scan failed after its last attempt");
    },
    async readScan(ctx, connectionId) {
      ctx.require("MANAGE_WORKSPACE");
      const source = await importSourceRepository(orm).findByConnection(connectionId);
      if (!source) {
        return null;
      }
      const saved = source.status === "scanned" ? await savedCounts(dependencies, source) : null;
      return scanOf(source, { progress: progressBySource.get(source.id) ?? null, saved });
    },
    async readConnectionUserEmail(ctx, connectionId) {
      ctx.require("MANAGE_WORKSPACE");
      const sources = importSourceRepository(orm);
      const source = await sources.findByConnection(connectionId);
      const record = source && (await sources.findConnectionUser(source.id));
      return record?.values.email ?? null;
    },
  };
  return service;
}

const SCAN_JOB = "imports.scanConnection";

/** Reads the connection's accounts, then saves them, their sync and setup's next step in one transaction. */
async function scanSource(
  ctx: SecurityContext,
  dependencies: ScanDependencies,
  { sourceId, connectionId }: { sourceId: string; connectionId: string },
  progressBySource: Map<string, ScanProgress>,
): Promise<void> {
  const { orm, logger, apps } = dependencies;
  const connection = (await apps.readConnectionById(orm, connectionId))!;
  const connector = await connectorOf(dependencies, connection.connector);
  const secrets = await apps.readSecrets(orm, connectionId);
  const retrying = <T>(call: () => Promise<T>) => withRetries(dependencies, sourceId, call);
  const session = await retrying(() =>
    connector.openSession({ settings: connection.settings, secrets }),
  );
  const accounts = await readAllAccounts(async (cursor) => {
    const page = await retrying(() => session.listAccounts(cursor));
    await saveConnectionUpdate(ctx, dependencies, connectionId, page.connection);
    return page;
  });
  const found = foundCounts(accounts);
  progressBySource.set(sourceId, { found });
  const { photos, accounts: savedAccounts } = await readChangedPhotos(ctx, dependencies, {
    sourceId,
    connector,
    session,
    accounts,
    retrying,
  });
  const findings = { sourceId, connection, connector, accounts: savedAccounts, photos };
  const { saved, finishedSetupScan } = await saveScan(ctx, dependencies, findings);
  logger.info(
    {
      sourceId,
      accounts: accounts.length,
      people: found.people,
      apps: found.apps,
      photoChanges: photos.size,
      saved,
      finishedSetupScan,
    },
    "Scan finished",
  );
}

/**
 * Replaces the source's records with what the scan found, syncs them and moves setup on, in one
 * transaction; saves nothing when the scan is no longer queued.
 */
async function saveScan(
  ctx: SecurityContext,
  dependencies: ScanDependencies,
  findings: ScanFindings,
): Promise<{ saved: boolean; finishedSetupScan: boolean }> {
  const { sourceId, accounts } = findings;
  return dependencies.transact(async (tx) => {
    const sources = importSourceRepository(tx);
    if ((await sources.lockById(sourceId))?.status !== "scanning") {
      return { saved: false, finishedSetupScan: false };
    }
    // Before the directory locks any employee, so two saves wait for each other, never deadlock.
    await dependencies.apps.holdAccountSyncs(ctx, tx);
    await sources.replaceRecords(sourceId, accounts);
    await syncAccounts(ctx, tx, findings, dependencies);
    await sources.markScanned(sourceId, new Date());
    // Setup waits for the directory's people; another app's scan never ends its scan step.
    const finishedSetupScan =
      findings.connector.isDirectory && (await setupSteps.finishScanStep(ctx, tx));
    return { saved: true, finishedSetupScan };
  });
}

async function readAllAccounts(
  listAccounts: (
    cursor: string | null,
  ) => Promise<{ accounts: ImportedAccount[]; nextCursor: string | null }>,
): Promise<ImportedAccount[]> {
  const accounts: ImportedAccount[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await listAccounts(cursor);
    accounts.push(...page.accounts);
    cursor = page.nextCursor;
    if (cursor !== null) {
      // A connector that pages in a circle would never end the scan.
      if (seenCursors.has(cursor)) {
        throw new ConnectorError("unexpected_response");
      }
      seenCursors.add(cursor);
    }
  } while (cursor !== null);
  // Each account is one record; a key seen twice is an answer the connector got wrong.
  if (new Set(accounts.map(({ sourceKey }) => sourceKey)).size !== accounts.length) {
    throw new ConnectorError("unexpected_response");
  }
  return accounts;
}

/** Runs `call`, trying it again after a rate-limited or unavailable answer until the attempts run out. */
function withRetries<T>(
  { logger, wait }: ScanDependencies,
  sourceId: string,
  call: () => Promise<T>,
): Promise<T> {
  return withConnectorRetries(call, {
    wait,
    onRetry: (failure, attempt) =>
      logger.info({ sourceId, failure, attempt }, "Scan call failed; trying again"),
  });
}

/** The directory's people among the accounts read (its own accounts), and the other apps they name. */
function foundCounts(accounts: readonly ImportedAccount[]): ScanCounts {
  // Counts the apps as the source names them; once the sync commits, the page shows the matched
  // apps, fewer when two names go to one catalog app.
  const people = accounts.filter(({ values }) => values.appExternalId === null);
  const otherApps = new Set(accounts.map(({ values }) => values.appExternalId));
  otherApps.delete(null);
  return {
    people: people.length,
    suspended: people.filter(({ values }) => values.status === "suspended").length,
    apps: otherApps.size,
  };
}

/** Saves the settings or secrets an answer renewed, in their own transaction, before the rest is used. */
async function saveConnectionUpdate(
  ctx: SecurityContext,
  { transact, apps, logger }: ScanDependencies,
  connectionId: string,
  update: ConnectionUpdate | undefined,
): Promise<void> {
  if (!update?.settings && !update?.secrets) {
    return;
  }
  await transact((tx) => apps.changeConnection(ctx, tx, connectionId, update));
  logger.info(
    {
      connectionId,
      settings: update.settings !== undefined,
      secrets: update.secrets !== undefined,
    },
    "Scan saved the connection's renewed settings or secrets",
  );
}

/** Marks a queued scan failed, unless another outcome came first. */
async function markFailed(
  transact: Transact,
  sourceId: string,
  failure: ConnectorErrorCode,
): Promise<void> {
  await transact(async (tx) => {
    const sources = importSourceRepository(tx);
    if ((await sources.lockById(sourceId))?.status === "scanning") {
      await sources.markFailed(sourceId, failure);
    }
  });
}

/** What the last scan's sync saved: the connection's app's people, and the other apps they use. */
async function savedCounts(
  dependencies: ScanDependencies,
  { id: sourceId, connectionId }: { id: string; connectionId: string },
): Promise<ScanCounts> {
  const { apps, orm } = dependencies;
  const connection = (await apps.readConnectionById(orm, connectionId))!;
  const connector = await findConnector(dependencies, connection.connector);
  if (connector && !connector.isDirectory) {
    // An app's scan counts the members it returned, whether or not they match employees.
    const { accounts, suspended } = await importSourceRepository(orm).countRecords(sourceId);
    return { people: accounts, suspended, apps: 0 };
  }
  const otherAppAccounts = connector?.findingKinds.otherAppAccounts;
  const [{ people, suspended }, otherApps] = await Promise.all([
    apps.countAccounts(orm, connection.appId),
    otherAppAccounts ? apps.countAppsFoundVia(orm, otherAppAccounts) : 0,
  ]);
  return { people, suspended, apps: otherApps };
}

/** The connection's connector; one the connectors container does not list now is unavailable. */
async function connectorOf(dependencies: ScanDependencies, key: string): Promise<Connector> {
  const connector = await findConnector(dependencies, key);
  if (!connector) {
    throw new ConnectorError("app_unavailable");
  }
  return connector;
}

async function findConnector(
  { connectors }: ScanDependencies,
  key: string,
): Promise<Connector | undefined> {
  return (await connectors.list()).find((candidate) => candidate.key === key);
}
