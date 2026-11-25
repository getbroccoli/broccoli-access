import {
  canChangeAccounts,
  canInvite,
  offersInviteRole,
  canRemoveAccounts,
  type Connector,
  type ConnectorErrorCode,
} from "../../../core/connectors";
import type { Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { accountChangeRepository, appAccountRepository, appConnectionRepository } from "../db";
import { type AccountChange, reconnectCauseOf } from "../domain";
import type { AccountChangeDependencies } from "./accountChangeService";
import type { AppConnectionService } from "./appConnectionService";
import { applyAccountChange } from "./applyAccountChange";
import { type ActionOutcome, callChange, NOT_CALLED } from "./callAccountChange";

/** What a run needs: the service's dependencies and its connection service. */
export type RunDependencies = AccountChangeDependencies & { connections: AppConnectionService };

/** A change the job runs: one without a connection fails when asked and never runs. */
export type RunnableChange = AccountChange & { connectionId: string };

/** Runs a running change through its connector and saves how it ended; skips any other. */
export async function runAccountChange(
  dependencies: RunDependencies,
  ctx: SecurityContext,
  changeId: string,
): Promise<void> {
  ctx.requireSystem();
  const { orm, transact, logger } = dependencies;
  const change = await accountChangeRepository(orm).findById(changeId);
  if (change?.status !== "running" || !isRunnable(change)) {
    logger.info(
      { changeId, status: change?.status ?? null },
      "Account change skipped: not running",
    );
    return;
  }
  const { error, calledServer, secretsUsed, reconnects, afterRenewal } = await runAction(
    dependencies,
    ctx,
    change,
  );
  if (!error) {
    await succeed(dependencies, ctx, change);
    return;
  }
  const { finished, turnedToReconnect } = await transact((tx) =>
    failChange(dependencies, ctx, tx, {
      change,
      error,
      calledServer,
      secretsUsed,
      reconnects,
      afterRenewal,
    }),
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

async function succeed(
  dependencies: RunDependencies,
  ctx: SecurityContext,
  change: RunnableChange,
): Promise<void> {
  const finished = await finishSucceeded(dependencies, ctx, change);
  dependencies.logger.info(
    {
      changeId: change.id,
      appAccountId: change.appAccountId,
      connectionId: change.connectionId,
      action: change.action,
      finished,
    },
    "Account change succeeded",
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
    reconnects,
    afterRenewal,
  }: ActionOutcome & { change: RunnableChange; error: ConnectorErrorCode },
): Promise<{ finished: boolean; turnedToReconnect: boolean }> {
  if (!reconnects || !reconnectCauseOf(error, { afterRenewal })) {
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
    afterRenewal,
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

function isRunnable(change: AccountChange): change is RunnableChange {
  return change.connectionId !== null;
}

async function runAction(
  dependencies: RunDependencies,
  ctx: SecurityContext,
  change: RunnableChange,
): Promise<ActionOutcome> {
  const { orm, connections, connectors } = dependencies;
  // One stored version, so a connection changed meanwhile never pairs old settings with new secrets.
  const { connection, secrets } = (await connections.readConnectionWithSecrets(
    orm,
    change.connectionId,
  ))!;
  // A change asked just before its connection turned to Reconnect fails with that cause.
  if (connection.reconnectCause) {
    return { ...NOT_CALLED, error: connection.reconnectCause, reconnects: true };
  }
  const connector = (await connectors.list()).find(({ key }) => key === connection.connector);
  // A connector the container no longer lists, or one that no longer makes this change, cannot act now.
  if (!connector || !canMake(connector, change)) {
    return { ...NOT_CALLED, error: "app_unavailable", reconnects: false };
  }
  const reconnects = !connector.isDirectory;
  if (change.action === "remove" && !(await canStillRemove(dependencies, change, connector))) {
    return { ...NOT_CALLED, error: "not_allowed", reconnects: false };
  }
  return callChange(dependencies, ctx, change, { connector, connection, secrets, reconnects });
}

/** Whether the connector makes the change: it supports the requested action on the server. */
function canMake(connector: Connector, { action, role }: AccountChange): boolean {
  if (action === "remove") return canRemoveAccounts(connector);
  if (action !== "invite") return canChangeAccounts(connector);
  return canInvite(connector) && offersInviteRole(connector.roles, role);
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
  dependencies: RunDependencies,
  ctx: SecurityContext,
  change: AccountChange,
): Promise<boolean> {
  return dependencies.transact(async (tx) => {
    // The lock scans take first: a scan deleting the account also locks this change. An invite,
    // or a change whose account a scan deleted, has no account to wait for.
    if (change.appAccountId || change.action === "remove") {
      await appAccountRepository(tx).lockForSync();
    }
    const changes = accountChangeRepository(tx);
    const stored = await changes.lockById(change.id);
    // A concurrent Reconnect fails queued changes, including this already-dispatched removal.
    const failedDuringCall =
      stored?.status === "failed" &&
      change.action === "remove" &&
      stored.attempts.length === 0 &&
      stored.error &&
      reconnectCauseOf(stored.error, { afterRenewal: true });
    if (!stored || (stored.status !== "running" && !failedDuringCall)) {
      return false;
    }
    const now = new Date();
    await changes.finish(
      change.id,
      {
        status: "succeeded",
        attempts: [{ runtime: "server", error: null, at: now }],
        error: null,
        finishedAt: now,
      },
      stored.status,
    );
    await applyAccountChange(dependencies, ctx, tx, change, {
      cause: {
        kind: change.action === "remove" ? "REMOVED_IN_APP" : "CHANGED_IN_APP",
        ref: change.id,
      },
      requestedBy: change.requestedBy,
    });
    return true;
  });
}

async function canStillRemove(
  { members, orm }: RunDependencies,
  change: RunnableChange,
  connector: Connector,
): Promise<boolean> {
  const matches = await members.findConnectionMembers(orm, {
    connectionIds: [change.connectionId],
    emails: [change.email],
  });
  const target = matches.find((member) => member.sourceKey === change.sourceKey);
  // An absent original member is an idempotent removal; the connector checks its key and email.
  if (!target) return true;
  if (matches.length !== 1 || target.isConnectionUser) return false;
  if (!canChangeAccounts(connector) || target.status === "suspended") return true;
  // A Disable made here disables the account before a scan saves the member as suspended; a scan
  // that sees the member active makes the account active again.
  const [account] = await appAccountRepository(orm).findByIds(
    change.appAccountId ? [change.appAccountId] : [],
  );
  return account?.status === "suspended";
}
