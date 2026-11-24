import { ApplicationError } from "../../../core/applicationError";
import {
  type Connector,
  type ConnectorErrorCode,
  type ConnectorRegistry,
} from "../../../core/connectors";
import type { Orm, Transact, Tx } from "../../../core/db";
import type { JobQueue } from "../../../core/jobs";
import type { Logger } from "../../../core/logger";
import type { SecurityContext } from "../../../core/security";
import { importSourceRepository } from "../db";
import { type Scan, type ScanCounts, type ScanProgress, scanOf } from "../domain";
import type { DirectoryPeople, IntegrationUser, ScannedApps } from "../ports";
import { type ScanFailure, scanSource } from "./scanSource";

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
   * error reading the accounts marks it failed and, in the same transaction, turns a connection of
   * the connectors container to Reconnect when the error needs it; one reading a photo only keeps
   * that person's photo as it is. System only.
   */
  runScan: (ctx: SecurityContext, sourceId: string) => Promise<void>;
  /**
   * The daily scan's job: queues a scan of every connection, Google Workspace included, each as
   * `scanConnection` does, so one already queued or running gets no second. System only.
   */
  scanEveryConnection: (ctx: SecurityContext) => Promise<void>;
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
  /** Whose directory account creates no employee. */
  integrationUser: IntegrationUser;
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
      const { connectionId } = source;
      try {
        const failed = await scanSource(
          ctx,
          dependencies,
          { sourceId, connectionId },
          progressBySource,
        );
        if (failed) {
          const turnedToReconnect = await failScanOfConnection(ctx, dependencies, {
            sourceId,
            connectionId,
            ...failed,
          });
          logger.warn(
            { sourceId, connectionId, failure: failed.failure, turnedToReconnect },
            "Scan failed",
          );
        }
      } finally {
        progressBySource.delete(sourceId);
      }
    },
    async scanEveryConnection(ctx) {
      ctx.requireSystem();
      // A source already scanning needs no other; it would only wait for that scan's save.
      const sources = (await importSourceRepository(orm).findAll()).filter(
        ({ status }) => status !== "scanning",
      );
      // One transaction each, so a source a running save holds delays only its own scan.
      for (const { connectionId, name } of sources) {
        await transact((tx) => service.scanConnection(ctx, tx, { connectionId, sourceName: name }));
      }
      logger.info({ connections: sources.length }, "Daily scans queued");
    },
    async failScan(ctx, sourceId) {
      ctx.requireSystem();
      await transact((tx) => markFailed(tx, sourceId, "app_unavailable"));
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
      return source ? sources.findConnectionUserEmail(source.id) : null;
    },
  };
  return service;
}

const SCAN_JOB = "imports.scanConnection";

/**
 * Marks a queued scan failed and, when the failure needs it, turns the connection to Reconnect in
 * the same transaction, unless another outcome came first; returns whether it turned.
 */
async function failScanOfConnection(
  ctx: SecurityContext,
  { transact, apps }: ScanDependencies,
  {
    sourceId,
    connectionId,
    failure,
    secretsUsed,
    reconnects,
    directoryRevision,
  }: ScanFailure & { sourceId: string; connectionId: string },
): Promise<boolean> {
  return transact(async (tx) => {
    if (!(await markFailed(tx, sourceId, failure))) return false;
    if (
      directoryRevision !== undefined &&
      !(await apps.holdConnectionRevision(tx, connectionId, directoryRevision))
    ) {
      throw new ApplicationError("CONFLICT", "The directory connection changed during the scan.");
    }
    if (!reconnects) return false;
    return apps.turnToReconnect(ctx, tx, {
      connectionId,
      error: failure,
      ref: sourceId,
      secretsUsed,
    });
  });
}

/** Marks a queued scan failed, joining `tx`; false when another outcome came first. */
async function markFailed(tx: Tx, sourceId: string, failure: ConnectorErrorCode): Promise<boolean> {
  const sources = importSourceRepository(tx);
  if ((await sources.lockById(sourceId))?.status !== "scanning") {
    return false;
  }
  await sources.markFailed(sourceId, failure);
  return true;
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

async function findConnector(
  { connectors }: ScanDependencies,
  key: string,
): Promise<Connector | undefined> {
  return (await connectors.list()).find((candidate) => candidate.key === key);
}
