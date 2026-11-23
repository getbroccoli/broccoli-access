import { isDeepStrictEqual } from "node:util";

import { ApplicationError } from "../../../core/applicationError";
import type { ConnectorErrorCode } from "../../../core/connectors";
import type { Orm, Tx } from "../../../core/db";
import { createRecordHistoryService, type HistoryAppend } from "../../../core/records";
import type { SecretBox } from "../../../core/secrets";
import type { SecurityContext } from "../../../core/security";
import { accountChangeRepository, type AppConnection, appConnectionRepository } from "../db";
import { type AccountChange, type ReconnectCause, reconnectCauseOf } from "../domain";

const recordHistory = createRecordHistoryService();

/** Why a connection needs reconnecting, and what found it. */
export interface ReconnectReason {
  cause: ReconnectCause;
  /** When the scan or the account change found it. */
  foundAt: Date;
  /** The account change that found it; null when a scan did. */
  foundByChange: AccountChange | null;
}

/** Turns the connection to `reconnect`, as `AppConnectionService.turnToReconnect` says. */
export async function turnToReconnect(
  secretBox: SecretBox,
  ctx: SecurityContext,
  tx: Tx,
  {
    connectionId,
    error,
    ref,
    secretsUsed,
  }: {
    connectionId: string;
    error: ConnectorErrorCode;
    ref: string;
    secretsUsed: Record<string, unknown> | null;
  },
): Promise<boolean> {
  ctx.requireSystem();
  const cause = reconnectCauseOf(error);
  const connections = appConnectionRepository(tx);
  const connection = await connections.lockById(connectionId);
  const stillUsed = await holdsSecrets(secretBox, tx, connectionId, secretsUsed);
  if (!cause || connection?.status !== "connected" || !stillUsed) {
    return false;
  }
  await connections.update(connectionId, { status: "reconnect", reconnectCause: cause });
  await appendStatusHistory(ctx, tx, { kind: "CONNECTOR_ERROR", ref }, connection, {
    status: "reconnect",
    reconnectCause: cause,
  });
  await accountChangeRepository(tx).failRunningOfConnection(connectionId, cause, new Date());
  return true;
}

/** Replaces the connection's secrets and sets it connected, with a history line when its status changed. */
export async function reconnect(
  secretBox: SecretBox,
  ctx: SecurityContext,
  tx: Tx,
  { connectionId, secrets }: { connectionId: string; secrets: Record<string, unknown> },
): Promise<void> {
  ctx.require("MANAGE_WORKSPACE");
  const connections = appConnectionRepository(tx);
  const old = await connections.lockById(connectionId);
  if (!old) {
    throw new ApplicationError("NOT_FOUND", "No app connection has this id.");
  }
  const encryptedSecrets = secretBox.encrypt(JSON.stringify(secrets), connectionId);
  const after = { status: "connected", reconnectCause: null } as const;
  await connections.update(connectionId, { encryptedSecrets, ...after });
  if (old.status !== after.status) {
    await appendStatusHistory(ctx, tx, { kind: "EDITED_DIRECTLY" }, old, after);
  }
}

/** Why each of the connections in `reconnect` needs it, by connection id. */
export async function readReconnectReasons(
  db: Orm | Tx,
  connectionIds: readonly string[],
): Promise<Map<string, ReconnectReason>> {
  // An instance has at most one connection per connector, so all of them are few.
  const reconnecting = (await appConnectionRepository(db).findAll()).filter(
    ({ id, reconnectCause }) => reconnectCause !== null && connectionIds.includes(id),
  );
  if (reconnecting.length === 0) {
    return new Map();
  }
  const lines = await recordHistory.readLatestWithCause(
    db,
    "app_connection",
    reconnecting.map(({ id }) => id),
    "CONNECTOR_ERROR",
  );
  // A line's ref is the account change that found it, or else the scan's source.
  const refs = [...lines.values()].flatMap(({ cause }) => (cause.ref ? [cause.ref] : []));
  const changes = await accountChangeRepository(db).findByIds(refs);
  return new Map(
    reconnecting.flatMap(({ id, reconnectCause }) => {
      const line = lines.get(id);
      if (!line) {
        return [];
      }
      const foundByChange = changes.find((change) => change.id === line.cause.ref) ?? null;
      return [[id, { cause: reconnectCause!, foundAt: line.occurredAt, foundByChange }]];
    }),
  );
}

/** Whether the connection still holds `secrets`, which a call read before an answer came back. */
export async function holdsSecrets(
  secretBox: SecretBox,
  tx: Tx,
  connectionId: string,
  secrets: Record<string, unknown> | null,
): Promise<boolean> {
  const encrypted = await appConnectionRepository(tx).findEncryptedSecrets(connectionId);
  const stored = encrypted && (JSON.parse(secretBox.decrypt(encrypted, connectionId)) as unknown);
  return isDeepStrictEqual(stored, secrets);
}

/** Appends the line of a connection's change of status and cause. */
async function appendStatusHistory(
  ctx: SecurityContext,
  tx: Tx,
  cause: HistoryAppend["cause"],
  before: Pick<AppConnection, "id" | "status" | "reconnectCause">,
  after: Pick<AppConnection, "status" | "reconnectCause">,
): Promise<void> {
  await recordHistory.append(ctx, tx, {
    recordType: "app_connection",
    operation: "UPDATED",
    cause,
    records: [
      {
        recordId: before.id,
        changes: [
          { field: "status", oldValue: before.status, newValue: after.status },
          {
            field: "reconnectCause",
            oldValue: before.reconnectCause,
            newValue: after.reconnectCause,
          },
        ],
      },
    ],
  });
}
