import { ApplicationError } from "../../../core/applicationError";
import {
  type ConnectionUpdate,
  type Connector,
  ConnectorError,
  type ConnectorErrorCode,
  type ImportedAccount,
  withConnectorRetries,
} from "../../../core/connectors";
import { createSetupStepService } from "../../../core/instance";
import type { SecurityContext } from "../../../core/security";
import { importSourceRepository } from "../db";
import type { ScanCounts, ScanProgress } from "../domain";
import { readChangedPhotos } from "./readChangedPhotos";
import type { ScannedApps } from "../ports";
import type { ScanDependencies } from "./scanService";
import { type ScanFindings, syncAccounts } from "./syncAccounts";

const setupSteps = createSetupStepService();

/** How a scan ended without saving: its connector error, and what turning to Reconnect needs. */
export interface ScanFailure {
  failure: ConnectorErrorCode;
  /** A directory failure is valid only for the credentials that produced it. */
  directoryRevision?: string;
  /** The secrets its failing call used, after the scan's own renewals; null before it read them. */
  secretsUsed: Record<string, unknown> | null;
  /** Whether the connection may turn to Reconnect: one of the connectors container's. */
  reconnects: boolean;
}

/**
 * Reads the connection's accounts, then saves them, their sync and setup's next step in one
 * transaction; returns how it failed when a connector call failed, null otherwise.
 */
export async function scanSource(
  ctx: SecurityContext,
  dependencies: ScanDependencies,
  { sourceId, connectionId }: { sourceId: string; connectionId: string },
  progressBySource: Map<string, ScanProgress>,
): Promise<ScanFailure | null> {
  const { orm, apps } = dependencies;
  const { connection, secrets, revision } = (await apps.readConnectionWithSecrets(
    orm,
    connectionId,
  ))!;
  const connector = (await dependencies.connectors.list()).find(
    (candidate) => candidate.key === connection.connector,
  );
  const used = { secrets };
  try {
    // A connector the connectors container does not list now is unavailable.
    if (!connector) {
      throw new ConnectorError("app_unavailable");
    }
    await readAndSave(
      ctx,
      dependencies,
      { sourceId, connection, connector, used, revision },
      progressBySource,
    );
    return null;
  } catch (error) {
    if (!(error instanceof ConnectorError)) {
      throw error;
    }
    // Directory recovery uses its scan failure, rather than changing the connection status.
    return {
      failure: error.code,
      directoryRevision: connector?.isDirectory ? revision : undefined,
      secretsUsed: used.secrets,
      reconnects: connector?.isDirectory === false,
    };
  }
}

/** The secrets the scan's calls use: the stored ones, then those it renewed and saved. */
interface SecretsInUse {
  secrets: Record<string, unknown>;
}

/** The scan's connection as the apps module gives it, without its secrets. */
type ScannedConnection = NonNullable<Awaited<ReturnType<ScannedApps["readConnectionById"]>>>;

async function readAndSave(
  ctx: SecurityContext,
  dependencies: ScanDependencies,
  target: {
    sourceId: string;
    connection: ScannedConnection;
    connector: Connector;
    used: SecretsInUse;
    revision: string;
  },
  progressBySource: Map<string, ScanProgress>,
): Promise<void> {
  const { sourceId, connection, connector, used, revision } = target;
  const readStartedAt = new Date();
  const retrying = <T>(call: () => Promise<T>) => withRetries(dependencies, sourceId, call);
  const session = await retrying(() =>
    connector.openSession({ settings: connection.settings, secrets: used.secrets }),
  );
  const accounts = await readAllAccounts(async (cursor) => {
    const page = await retrying(() => session.listAccounts(cursor));
    await saveConnectionUpdate(
      ctx,
      dependencies,
      { connectionId: connection.id, used },
      page.connection,
    );
    return page;
  });
  const found = foundCounts(accounts);
  progressBySource.set(sourceId, { found });
  const read = await readChangedPhotos(ctx, dependencies, {
    sourceId,
    connector,
    session,
    accounts,
    retrying,
  });
  const findings = { sourceId, connection, connector, readStartedAt, revision, ...read };
  const outcome = await saveScan(ctx, dependencies, findings);
  dependencies.logger.info(
    { sourceId, accounts: accounts.length, ...found, photoChanges: read.photos.size, ...outcome },
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
  findings: ScanFindings & { revision: string },
): Promise<{ saved: boolean; finishedSetupScan: boolean }> {
  const { sourceId, accounts } = findings;
  return dependencies.transact(async (tx) => {
    const sources = importSourceRepository(tx);
    if ((await sources.lockById(sourceId))?.status !== "scanning") {
      return { saved: false, finishedSetupScan: false };
    }
    // Before the directory locks any employee, so two saves wait for each other, never deadlock.
    await dependencies.apps.holdAccountSyncs(ctx, tx);
    if (
      findings.connector.isDirectory &&
      !(await dependencies.apps.holdConnectionRevision(
        tx,
        findings.connection.id,
        findings.revision,
      ))
    ) {
      // The job retries from a fresh connection; stale findings must never reach app history.
      throw new ApplicationError("CONFLICT", "The directory connection changed during the scan.");
    }
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
  { connectionId, used }: { connectionId: string; used: SecretsInUse },
  update: ConnectionUpdate | undefined,
): Promise<void> {
  if (!update?.settings && !update?.secrets) {
    return;
  }
  // A reconnect meanwhile replaced the secrets this scan's calls use; its own stay.
  const saved = await transact((tx) =>
    apps.changeConnection(ctx, tx, connectionId, { ...update, replacing: used.secrets }),
  );
  if (saved && update.secrets) {
    used.secrets = update.secrets;
  }
  logger.info(
    {
      connectionId,
      settings: update.settings !== undefined,
      secrets: update.secrets !== undefined,
      saved,
    },
    "Scan answered with renewed settings or secrets",
  );
}
