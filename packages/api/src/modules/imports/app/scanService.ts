import { setTimeout as sleep } from "node:timers/promises";

import { ApplicationError } from "../../../core/applicationError";
import {
  type Connector,
  ConnectorError,
  type ConnectorErrorCode,
  type ImportedAccount,
  RETRIED_CONNECTOR_ERRORS,
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
   * Marks the connection's source scanning, creating it on the first scan, and queues the scan's
   * job, joining `tx`. While a scan of the connection is queued or running, it queues nothing
   * more. Needs MANAGE_WORKSPACE; refuses an unknown connection with NOT_FOUND.
   */
  scanConnection: (
    ctx: SecurityContext,
    tx: Tx,
    connectionId: string,
  ) => Promise<{ sourceId: string }>;
  /**
   * "Scan now": queues a scan of the connection as `scanConnection` does, in its own transaction,
   * and returns the scan, now scanning. Needs MANAGE_WORKSPACE; refuses an unknown connection
   * with NOT_FOUND.
   */
  scanNow: (ctx: SecurityContext, connectionId: string) => Promise<Scan>;
  /**
   * The scan's job: reads every page of the connection's accounts and a directory's changed
   * photos, trying a rate-limited or unavailable call again, then in one transaction replaces the
   * source's records, syncs them, marks it scanned and moves setup from the scan to selecting the
   * apps. A connector error reading the accounts marks it failed and changes nothing else; one
   * reading a photo only keeps that person's photo as it is. System only.
   */
  runScan: (ctx: SecurityContext, sourceId: string) => Promise<void>;
  /** The job's attempts are used up: the scan failed with `app_unavailable`. System only. */
  failScan: (ctx: SecurityContext, sourceId: string) => Promise<void>;
  /** The connection's scan as the scan page shows it; null before the first. Needs MANAGE_WORKSPACE. */
  readScan: (ctx: SecurityContext, connectionId: string) => Promise<Scan | null>;
}

export interface ScanDependencies {
  orm: Orm;
  transact: Transact;
  logger: Logger;
  jobs: JobQueue;
  /** Every connector module's definition. */
  connectors: readonly Connector[];
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
    async scanConnection(ctx, tx, connectionId) {
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
        const name = connectorOf(dependencies, connection.connector).sourceName(
          connection.settings,
        );
        sourceId = (await sources.insertScanning({ connectionId, name })).id;
      }
      await jobs.send(tx, SCAN_JOB, { sourceId });
      return { sourceId };
    },
    async scanNow(ctx, connectionId) {
      const { sourceId } = await transact((tx) => service.scanConnection(ctx, tx, connectionId));
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
      const saved =
        source.status === "scanned" ? await savedCounts(dependencies, connectionId) : null;
      return scanOf(source, { progress: progressBySource.get(source.id) ?? null, saved });
    },
  };
  return service;
}

const SCAN_JOB = "imports.scanConnection";

/** Three attempts in all for a rate-limited or unavailable call. */
const ATTEMPTS = 3;

/** The wait before the second attempt, doubled before each later one, as Google advises. */
const FIRST_RETRY_DELAY_MS = 1_000;

/** Reads the connection's accounts, then saves them, their sync and setup's next step in one transaction. */
async function scanSource(
  ctx: SecurityContext,
  dependencies: ScanDependencies,
  { sourceId, connectionId }: { sourceId: string; connectionId: string },
  progressBySource: Map<string, ScanProgress>,
): Promise<void> {
  const { orm, logger, apps } = dependencies;
  const connection = (await apps.readConnectionById(orm, connectionId))!;
  const connector = connectorOf(dependencies, connection.connector);
  const secrets = await apps.readSecrets(orm, connectionId);
  const retrying = <T>(call: () => Promise<T>) => withRetries(dependencies, sourceId, call);
  const session = await retrying(() =>
    connector.openSession({ settings: connection.settings, secrets }),
  );
  const accounts = await readAllAccounts((cursor) => retrying(() => session.listAccounts(cursor)));
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
    await sources.replaceRecords(sourceId, accounts);
    await syncAccounts(ctx, tx, findings, dependencies);
    await sources.markScanned(sourceId, new Date());
    return { saved: true, finishedSetupScan: await setupSteps.finishScanStep(ctx, tx) };
  });
}

async function readAllAccounts(
  listAccounts: (
    cursor: string | null,
  ) => Promise<{ accounts: ImportedAccount[]; nextCursor: string | null }>,
): Promise<ImportedAccount[]> {
  const accounts: ImportedAccount[] = [];
  let cursor: string | null = null;
  do {
    const page = await listAccounts(cursor);
    accounts.push(...page.accounts);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return accounts;
}

/** Runs `call`, trying it again after a rate-limited or unavailable answer until the attempts run out. */
async function withRetries<T>(
  { logger, wait = sleep }: ScanDependencies,
  sourceId: string,
  call: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      const retried =
        error instanceof ConnectorError && RETRIED_CONNECTOR_ERRORS.includes(error.code);
      if (!retried || attempt === ATTEMPTS) {
        throw error;
      }
      logger.info({ sourceId, failure: error.code, attempt }, "Scan call failed; trying again");
      await wait(FIRST_RETRY_DELAY_MS * 2 ** (attempt - 1));
    }
  }
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
  connectionId: string,
): Promise<ScanCounts> {
  const { apps, orm } = dependencies;
  const connection = (await apps.readConnectionById(orm, connectionId))!;
  const { otherAppAccounts } = connectorOf(dependencies, connection.connector).findingKinds;
  const [{ people, suspended }, otherApps] = await Promise.all([
    apps.countAccounts(orm, connection.appId),
    otherAppAccounts ? apps.countAppsFoundVia(orm, otherAppAccounts) : 0,
  ]);
  return { people, suspended, apps: otherApps };
}

function connectorOf({ connectors }: ScanDependencies, key: string): Connector {
  const connector = connectors.find((candidate) => candidate.key === key);
  if (!connector) {
    throw new Error(`No connector module has the key ${key}`);
  }
  return connector;
}
