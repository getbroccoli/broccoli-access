import { ApplicationError } from "../../../core/applicationError";
import {
  type AccountPage,
  type ConnectionUpdate,
  type Connector,
  ConnectorError,
  type ConnectorErrorCode,
  type ImportedAccount,
  type PendingInvitation,
  callWithRenewal,
  RenewalError,
  RenewedSessionRefusedError,
  withConnectorRetries,
} from "../../../core/connectors";
import type { SecurityContext } from "../../../core/security";
import { importSourceRepository } from "../db";
import type { ScanCounts, ScanProgress } from "../domain";
import { readChangedPhotos } from "./readChangedPhotos";
import type { ScannedApps } from "../ports";
import type { ScanDependencies } from "./scanService";
import { saveScan } from "./saveScan";

/** How a scan ended without saving: its connector error, and what turning to Reconnect needs. */
export interface ScanFailure {
  failure: ConnectorErrorCode;
  /** A directory failure is valid only for the credentials that produced it. */
  directoryRevision?: string;
  /** The secrets its failing call used, after the scan's own renewals; null before it read them. */
  secretsUsed: Record<string, unknown> | null;
  /** Whether the connection may turn to Reconnect: one of the connectors container's. */
  reconnects: boolean;
  /** Whether the failure is what signing in again answered, which turns Reconnect with a check too. */
  afterRenewal: boolean;
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
  restarted = false,
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
    const target = { sourceId, connection, connector, used, revision };
    const saved = await readRenewing(ctx, dependencies, target, progressBySource);
    if (!saved) {
      if (restarted)
        throw new ApplicationError("CONFLICT", "The roster changed on both scan attempts.");
      dependencies.logger.info(
        { sourceId, connectionId },
        "Restarting scan after an overlapping membership change",
      );
      return scanSource(ctx, dependencies, { sourceId, connectionId }, progressBySource, true);
    }
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
      reconnects:
        connector?.isDirectory === false && !(error instanceof RenewedSessionRefusedError),
      afterRenewal: error instanceof RenewalError,
    };
  }
}

/**
 * Reads and saves the scan, signing in again once when a call answers `authentication_failed` for
 * a connection made by sign-in. A connection whose integration user the directory shows suspended
 * makes no call at all.
 */
async function readRenewing(
  ctx: SecurityContext,
  dependencies: ScanDependencies,
  target: ScanTarget,
  progressBySource: Map<string, ScanProgress>,
): Promise<boolean> {
  const { renewals, logger } = dependencies;
  const { sourceId, connection, connector, used } = target;
  if (!connector.isDirectory && (await renewals.isStopped(connection.id))) {
    logger.warn(
      { sourceId, connectionId: connection.id },
      "Scan not called: the integration user is suspended in the directory",
    );
    throw new ConnectorError("authentication_failed");
  }
  return callWithRenewal(() => readAndSave(ctx, dependencies, target, progressBySource), {
    renewals,
    ctx,
    connectionId: connection.id,
    secrets: () => used.secrets,
    onRenewed: (renewed) => {
      used.secrets = renewed;
    },
  });
}

/** The secrets the scan's calls use: the stored ones, then those it renewed and saved. */
interface SecretsInUse {
  secrets: Record<string, unknown>;
}

/** The scan's connection as the apps module gives it, without its secrets. */
type ScannedConnection = NonNullable<Awaited<ReturnType<ScannedApps["readConnectionById"]>>>;

interface ScanTarget {
  sourceId: string;
  connection: ScannedConnection;
  connector: Connector;
  used: SecretsInUse;
  revision: string;
}

async function readAndSave(
  ctx: SecurityContext,
  dependencies: ScanDependencies,
  target: ScanTarget,
  progressBySource: Map<string, ScanProgress>,
): Promise<boolean> {
  const { used, ...scanned } = target;
  const { sourceId, connection, connector } = scanned;
  const renewing = { connectionId: connection.id, used };
  const readStartedAt = new Date();
  const savedCount = connector.isDirectory
    ? null
    : (await importSourceRepository(dependencies.orm).countRecords(sourceId)).accounts;
  const retrying = <T>(call: () => Promise<T>) => withRetries(dependencies, sourceId, call);
  const session = await retrying(() =>
    connector.openSession({ settings: connection.settings, secrets: used.secrets }),
  );
  const { accounts, invitations } = await readAllPages(async (cursor) => {
    const page = await retrying(() => session.listAccounts(cursor));
    await saveConnectionUpdate(ctx, dependencies, renewing, page.connection);
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
  const outcome = await saveScan(ctx, dependencies, {
    ...scanned,
    savedCount,
    readStartedAt,
    invitations,
    ...read,
  });
  if (!outcome) return false;
  logScan(dependencies, sourceId, found, { accounts, invitations, photos: read.photos }, outcome);
  return true;
}

/** Every page's accounts, and the pending invitations any page carries. */
async function readAllPages(
  listAccounts: (cursor: string | null) => Promise<AccountPage>,
): Promise<{ accounts: ImportedAccount[]; invitations: PendingInvitation[] }> {
  const accounts: ImportedAccount[] = [];
  const invitations: PendingInvitation[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await listAccounts(cursor);
    accounts.push(...page.accounts);
    invitations.push(...(page.invitations ?? []));
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
  return { accounts, invitations };
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

function logScan(
  { logger }: ScanDependencies,
  sourceId: string,
  found: ScanCounts,
  read: { accounts: ImportedAccount[]; invitations: PendingInvitation[]; photos: { size: number } },
  outcome: { saved: boolean; finishedSetupScan: boolean },
) {
  logger.info(
    {
      sourceId,
      accounts: read.accounts.length,
      ...found,
      invitations: read.invitations.length,
      photoChanges: read.photos.size,
      ...outcome,
    },
    "Scan finished",
  );
}
