import {
  canChangeAccounts,
  canInvite,
  type ConnectionUpdate,
  type Connector,
  ConnectorError,
  type ConnectorErrorCode,
  type ConnectorSession,
  withConnectorRetries,
} from "../../../core/connectors";
import type { Transact, Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { accountChangeRepository, appAccountRepository, appConnectionRepository } from "../db";
import { type AccountChange, reconnectCauseOf, statusAfter } from "../domain";
import type { AccountChangeDependencies } from "./accountChangeService";
import type { AppConnectionService } from "./appConnectionService";
import { setAccountStatus } from "./setAccountStatus";

/** What a run needs: the service's dependencies and its connection service. */
type RunDependencies = AccountChangeDependencies & { connections: AppConnectionService };

/** Runs a running change through its connector and saves how it ended; skips any other. */
export async function runAccountChange(
  dependencies: RunDependencies,
  ctx: SecurityContext,
  changeId: string,
): Promise<void> {
  ctx.requireSystem();
  const { orm, transact, logger } = dependencies;
  const change = await accountChangeRepository(orm).findById(changeId);
  if (change?.status !== "running") {
    logger.info(
      { changeId, status: change?.status ?? null },
      "Account change skipped: not running",
    );
    return;
  }
  const { error, calledServer, secretsUsed } = await runAction(dependencies, ctx, change);
  if (!error) {
    const finished = await finishSucceeded(transact, ctx, change);
    logger.info(
      {
        changeId,
        appAccountId: change.appAccountId,
        connectionId: change.connectionId,
        action: change.action,
        finished,
      },
      "Account change succeeded",
    );
    return;
  }
  const { finished, turnedToReconnect } = await transact((tx) =>
    failChange(dependencies, ctx, tx, { change, error, calledServer, secretsUsed }),
  );
  logger.warn(
    {
      changeId,
      appAccountId: change.appAccountId,
      connectionId: change.connectionId,
      action: change.action,
      finished,
      failure: error,
      turnedToReconnect,
    },
    "Account change failed",
  );
}

/**
 * Fails the change with its error, joining `tx`, and turns its connection to Reconnect when the
 * error needs it, whatever happened to the change, as the connector contract says.
 */
async function failChange(
  { connections }: RunDependencies,
  ctx: SecurityContext,
  tx: Tx,
  {
    change,
    error,
    calledServer,
    secretsUsed,
  }: ActionOutcome & { change: AccountChange; error: ConnectorErrorCode },
): Promise<{ finished: boolean; turnedToReconnect: boolean }> {
  if (!reconnectCauseOf(error)) {
    return {
      finished: await finishFailed(tx, change.id, error, calledServer),
      turnedToReconnect: false,
    };
  }
  // The lock a scan turning the connection to Reconnect takes first, so the two never deadlock.
  await appConnectionRepository(tx).lockById(change.connectionId);
  const finished = await finishFailed(tx, change.id, error, calledServer);
  const turnedToReconnect = await connections.turnToReconnect(ctx, tx, {
    connectionId: change.connectionId,
    error,
    ref: change.id,
    secretsUsed,
  });
  return { finished, turnedToReconnect };
}

/** Fails a change that is still running with `app_unavailable`, after its job's last attempt. */
export async function failRunningChange(
  { transact, logger }: AccountChangeDependencies,
  ctx: SecurityContext,
  changeId: string,
): Promise<void> {
  ctx.requireSystem();
  const failed = await transact((tx) => finishFailed(tx, changeId, "app_unavailable", false));
  logger.warn({ changeId, failed }, "Account change failed after its job's last attempt");
}

/** How the action ended: its error, null once the member read back changed; and whether the server was called. */
interface ActionOutcome {
  error: ConnectorErrorCode | null;
  calledServer: boolean;
  /** The secrets its call used; null when it made none. */
  secretsUsed: Record<string, unknown> | null;
}

async function runAction(
  dependencies: RunDependencies,
  ctx: SecurityContext,
  change: AccountChange,
): Promise<ActionOutcome> {
  const { orm, connections, connectors, wait, logger } = dependencies;
  const connection = (await connections.readConnectionById(orm, change.connectionId))!;
  // A change asked just before its connection turned to Reconnect fails with that cause.
  if (connection.reconnectCause) {
    return { error: connection.reconnectCause, calledServer: false, secretsUsed: null };
  }
  const connector = (await connectors.list()).find(({ key }) => key === connection.connector);
  // A connector the container no longer lists, or one that no longer makes this change, cannot act now.
  if (!connector || !canMake(connector, change)) {
    return { error: "app_unavailable", calledServer: false, secretsUsed: null };
  }
  let calledServer = false;
  const secrets = await connections.readSecrets(orm, change.connectionId);
  try {
    const session = await connector.openSession({ settings: connection.settings, secrets });
    const result = await withConnectorRetries(
      () => {
        calledServer = true;
        return makeChange(session, change);
      },
      {
        wait,
        onRetry: (failure, attempt) =>
          logger.info(
            { changeId: change.id, failure, attempt },
            "Account change call failed; trying again",
          ),
      },
    );
    await saveConnectionUpdate(dependencies, ctx, change, {
      ...result.connection,
      replacing: secrets!,
    });
    return {
      error: result.readBack ? null : "unexpected_response",
      calledServer,
      secretsUsed: secrets,
    };
  } catch (error) {
    if (error instanceof ConnectorError) {
      return { error: error.code, calledServer, secretsUsed: secrets };
    }
    throw error;
  }
}

/** Whether the connector makes the change: it disables and enables accounts, or invites. */
function canMake(connector: Connector, { action }: AccountChange): boolean {
  return action === "invite" ? canInvite(connector) : canChangeAccounts(connector);
}

/**
 * Makes the change in one call and tells whether it read back: the member's new status, or for an
 * invite, the invitation or the email's member, which the session checks. Success is what is read
 * back, never a call that went through.
 */
async function makeChange(
  session: ConnectorSession,
  change: AccountChange,
): Promise<{ readBack: boolean; connection?: ConnectionUpdate }> {
  if (change.action === "invite") {
    return { ...(await session.invite!(change.email)), readBack: true };
  }
  // A Disable or Enable always copies the member's source key.
  const account = { sourceKey: change.sourceKey!, email: change.email };
  const { status, connection } = await session.runAction!(change.action, account);
  return { readBack: status === statusAfter(change.action), connection };
}

/** Saves what the answer renewed, unless a reconnect replaced the secrets its call used meanwhile. */
async function saveConnectionUpdate(
  { transact, connections, logger }: RunDependencies,
  ctx: SecurityContext,
  change: AccountChange,
  update: ConnectionUpdate & { replacing: Record<string, unknown> },
): Promise<void> {
  if (!update.settings && !update.secrets) {
    return;
  }
  const saved = await transact((tx) =>
    connections.changeConnection(ctx, tx, change.connectionId, update),
  );
  logger.info(
    { changeId: change.id, connectionId: change.connectionId, saved },
    "Account change answered with renewed settings or secrets",
  );
}

/**
 * Fails a running change with `error`, adding the server's attempt when it was called, joining
 * `tx`; false when another outcome came first.
 */
async function finishFailed(
  tx: Tx,
  changeId: string,
  error: ConnectorErrorCode,
  calledServer: boolean,
): Promise<boolean> {
  const changes = accountChangeRepository(tx);
  const change = await changes.lockById(changeId);
  if (change?.status !== "running") {
    return false;
  }
  const at = new Date();
  const attempt = { runtime: "server" as const, error, at };
  await changes.finish(changeId, {
    status: "failed",
    attempts: calledServer ? [...change.attempts, attempt] : change.attempts,
    error,
    finishedAt: at,
  });
  return true;
}

/**
 * Ends the change as succeeded and sets its account's status, with a history line by the user who
 * asked; false when another outcome came first.
 */
async function finishSucceeded(
  transact: Transact,
  ctx: SecurityContext,
  change: AccountChange,
): Promise<boolean> {
  return transact(async (tx) => {
    // The lock scans take first: a scan deleting the account also locks this change. An invite,
    // or a change whose account a scan deleted, has no account to wait for.
    if (change.appAccountId) {
      await appAccountRepository(tx).lockForSync();
    }
    const changes = accountChangeRepository(tx);
    if ((await changes.lockById(change.id))?.status !== "running") {
      return false;
    }
    const now = new Date();
    await changes.finish(change.id, {
      status: "succeeded",
      attempts: [{ runtime: "server", error: null, at: now }],
      error: null,
      finishedAt: now,
    });
    await setAccountStatus(ctx, tx, change, {
      cause: { kind: "CHANGED_IN_APP", ref: change.id },
      requestedBy: change.requestedBy,
    });
    return true;
  });
}
