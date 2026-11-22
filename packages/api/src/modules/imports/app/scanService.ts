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
import type { Logger } from "../../../core/logger";
import type { SecurityContext } from "../../../core/security";
import { importSourceRepository } from "../db";
import { type PeopleCount, type Scan, type ScanProgress, scanOf } from "../domain";
import type { DirectoryPeople, ScannedApps } from "../ports";
import { syncAccounts } from "./syncAccounts";

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
   * The scan's job: reads every page of the connection's accounts, trying a rate-limited or
   * unavailable call again, then in one transaction replaces the source's records, syncs them
   * and marks it scanned. A connector error marks it failed and changes nothing else. System only.
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
  return {
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
        const name = connectorOf(dependencies, connection.connector).sourceName(connection.settings);
        sourceId = (await sources.insertScanning({ connectionId, name })).id;
      }
      await jobs.send(tx, SCAN_JOB, { sourceId });
      return { sourceId };
    },
    async runScan(ctx, sourceId) {
      ctx.requireSystem();
      const source = await importSourceRepository(orm).findById(sourceId);
      if (source?.status !== "scanning") {
        logger.info({ sourceId, status: source?.status ?? null }, "Scan skipped: not queued");
        return;
      }
      progressBySource.set(sourceId, { people: null });
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
      const saved = source.status === "scanned" ? await savedPeople(apps, orm, connectionId) : null;
      return scanOf(source, { progress: progressBySource.get(source.id) ?? null, saved });
    },
  };
}

const SCAN_JOB = "imports.scanConnection";

/** Three attempts in all for a rate-limited or unavailable call. */
const ATTEMPTS = 3;

/** The wait before the second attempt, doubled before each later one, as Google advises. */
const FIRST_RETRY_DELAY_MS = 1_000;

/** Reads the connection's accounts, then saves them and their sync in one transaction. */
async function scanSource(
  ctx: SecurityContext,
  dependencies: ScanDependencies,
  { sourceId, connectionId }: { sourceId: string; connectionId: string },
  progressBySource: Map<string, ScanProgress>,
): Promise<void> {
  const { orm, transact, logger, apps } = dependencies;
  const connection = (await apps.readConnectionById(orm, connectionId))!;
  const connector = connectorOf(dependencies, connection.connector);
  const secrets = await apps.readSecrets(orm, connectionId);
  const retrying = <T>(call: () => Promise<T>) => withRetries(dependencies, sourceId, call);
  const session = await retrying(() =>
    connector.openSession({ settings: connection.settings, secrets }),
  );
  const accounts = await readAllAccounts((cursor) => retrying(() => session.listAccounts(cursor)));
  progressBySource.set(sourceId, { people: peopleCount(accounts) });
  const saved = await transact(async (tx) => {
    const sources = importSourceRepository(tx);
    if ((await sources.lockById(sourceId))?.status !== "scanning") {
      return false;
    }
    await sources.replaceRecords(sourceId, accounts);
    await syncAccounts(ctx, tx, { sourceId, connection, connector, accounts }, dependencies);
    await sources.markScanned(sourceId, new Date());
    return true;
  });
  logger.info({ sourceId, accounts: accounts.length, saved }, "Scan finished");
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

/** The directory's people among the accounts read: its own accounts, and the suspended ones. */
function peopleCount(accounts: readonly ImportedAccount[]): PeopleCount {
  const people = accounts.filter(({ values }) => values.appExternalId === null);
  return {
    count: people.length,
    suspended: people.filter(({ values }) => values.status === "suspended").length,
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

async function savedPeople(
  apps: ScannedApps,
  orm: Orm,
  connectionId: string,
): Promise<PeopleCount> {
  const connection = (await apps.readConnectionById(orm, connectionId))!;
  const { people, suspended } = await apps.countAccounts(orm, connection.appId);
  return { count: people, suspended };
}

function connectorOf({ connectors }: ScanDependencies, key: string): Connector {
  const connector = connectors.find((candidate) => candidate.key === key);
  if (!connector) {
    throw new Error(`No connector module has the key ${key}`);
  }
  return connector;
}
