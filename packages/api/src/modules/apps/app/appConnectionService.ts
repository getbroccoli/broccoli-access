import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { ApplicationError } from "../../../core/applicationError";
import type { AppSessionSource, ConnectorErrorCode } from "../../../core/connectors";
import type { Orm, Tx } from "../../../core/db";
import type { FieldChange } from "../../../core/records";
import { createRecordHistoryService } from "../../../core/records";
import type { SecretBox } from "../../../core/secrets";
import type { SecurityContext } from "../../../core/security";
import {
  type App,
  type AppConnection,
  appAccountRepository,
  appConnectionRepository,
  appRepository,
} from "../db";
import { appChanges, CATALOG_KEYS, catalogApp, type CatalogApp, connectedAppOf } from "../domain";
import {
  holdsSecrets,
  readReconnectReasons,
  reconnect,
  type Reconnection,
  type ReconnectReason,
  syncIntegrationUserStops,
  turnToReconnect,
} from "./connectionReconnects";

const recordHistory = createRecordHistoryService();

/** Connected apps: the app itself, approved, and its connector's settings and secrets. */
export interface AppConnectionService {
  /**
   * Approves the connector's app (the app with the connector's key as catalog key, else its name,
   * else a new one) and saves its connection with `secrets` encrypted under the connection's id,
   * the caller as who accepted the connector's notice at `noticeAcceptedAt`, and who made its app
   * session, joining `tx`; appends the history of both. Connects and scan saves run one at a time. Admins only; refuses
   * with CONFLICT a connector already connected, or an app another connector reads.
   */
  connectApp: (
    ctx: SecurityContext,
    tx: Tx,
    connection: {
      connector: string;
      /** The connector's app, created from these when no app matches. */
      app: { name: string; domain: string | null };
      settings: Record<string, unknown>;
      secrets: Record<string, unknown>;
      /** Set exactly for a connector with a notice, which a signed-in user accepted. */
      noticeAcceptedAt?: Date;
      /** Set exactly for secrets that hold an app session. */
      sessionFrom?: AppSessionSource;
    },
  ) => Promise<{ appId: string; connectionId: string }>;
  /**
   * Replaces the connection's settings or secrets, whichever `update` carries, joining `tx`; new
   * settings add a line to its history, secrets never. With `replacing`, the secrets of the call
   * whose answer renewed them, it saves nothing once the stored secrets differ, such as after a
   * reconnect; `replacingRevision` likewise refuses a changed app. Returns whether it saved.
   * Admins only; refuses an unknown connection with NOT_FOUND.
   */
  changeConnection: (
    ctx: SecurityContext,
    tx: Tx,
    connectionId: string,
    update: {
      settings?: Record<string, unknown>;
      secrets?: Record<string, unknown>;
      replacing?: Record<string, unknown>;
      replacingRevision?: string;
    },
  ) => Promise<boolean>;
  /**
   * Turns the connection to `reconnect` when `error` is a reconnect cause, joining `tx`: stores the
   * cause, appends a `CONNECTOR_ERROR` line whose ref is `ref` (the scan's source or the account
   * change) and fails the connection's running changes with the cause. Does nothing for another
   * error, a connection already in `reconnect`, or one whose secrets are no longer the ones the
   * failing call used (`secretsUsed`, null without a call), such as after a reconnect. Returns
   * whether it turned. System only.
   */
  turnToReconnect: (
    ctx: SecurityContext,
    tx: Tx,
    failure: {
      connectionId: string;
      error: ConnectorErrorCode;
      ref: string;
      secretsUsed: Record<string, unknown> | null;
      /** The error is what signing in again answered, so a check also counts as a cause. */
      afterRenewal?: boolean;
    },
  ) => Promise<boolean>;
  /**
   * After the directory's scan `ref`: with the integration user `suspended` there, turns every
   * connected connection made by its sign-in to `reconnect` with `authentication_failed`, failing
   * its running changes; with it active, turns those that this scan's suspension stopped back to
   * `connected`, never one in `reconnect` for another reason. Appends the history, joining `tx`.
   * System only.
   */
  syncIntegrationUserStops: (
    ctx: SecurityContext,
    tx: Tx,
    scan: { suspended: boolean; ref: string },
  ) => Promise<void>;
  /**
   * Replaces the connection's secrets, with who made their app session, and sets it `connected`
   * without a cause, joining `tx`; appends an `EDITED_DIRECTLY` line when its status changed, and
   * one when who made its session did, never with a secret. Admins only; refuses an unknown
   * connection with NOT_FOUND.
   */
  reconnect: (ctx: SecurityContext, tx: Tx, reconnection: Reconnection) => Promise<void>;
  /**
   * Why each of the connections in `reconnect` needs it, by connection id; a connected one is left
   * out. Trusted read: no `ctx`.
   */
  readReconnectReasons: (
    db: Orm | Tx,
    connectionIds: readonly string[],
  ) => Promise<Map<string, ReconnectReason>>;
  /** The connection of `connector` without its secrets, or null. Trusted read: no `ctx`. */
  readConnection: (db: Orm | Tx, connector: string) => Promise<AppConnection | null>;
  /** Every connection without its secrets. Trusted read: no `ctx`. */
  readConnections: (db: Orm | Tx) => Promise<AppConnection[]>;
  /**
   * The catalog apps among `catalogKeys` that have no app yet, whatever its status; a key the
   * catalog lacks has none. Trusted read: no `ctx`.
   */
  readCatalogAppsWithoutApp: (
    db: Orm | Tx,
    catalogKeys: readonly string[],
  ) => Promise<CatalogApp[]>;
  /** The connection with id `connectionId` without its secrets, or null. Trusted read: no `ctx`. */
  readConnectionById: (db: Orm | Tx, connectionId: string) => Promise<AppConnection | null>;
  /** Matching settings and decrypted secrets from one stored version. Trusted read; never for a client. */
  readConnectionWithSecrets: (
    db: Orm | Tx,
    connectionId: string,
  ) => Promise<{
    connection: AppConnection;
    secrets: Record<string, string>;
    revision: string;
  } | null>;
  /** Locks the connection for this transaction; true only if its settings and credentials still match. */
  holdConnectionRevision: (tx: Tx, connectionId: string, revision: string) => Promise<boolean>;
  /**
   * The connection's secrets, decrypted, such as Google Workspace's `{ clientSecret, refreshToken }`;
   * null for an unknown connection. Trusted read: no `ctx`, and never for a client.
   */
  readSecrets: (db: Orm | Tx, connectionId: string) => Promise<Record<string, string> | null>;
}

export function createAppConnectionService({
  secretBox,
}: {
  secretBox: SecretBox;
}): AppConnectionService {
  return {
    async connectApp(ctx, tx, connection) {
      const { connector, app: appFields, settings, secrets, noticeAcceptedAt } = connection;
      const { sessionFrom } = connection;
      ctx.require("MANAGE_WORKSPACE");
      const noticeAccepted = noticeAcceptedAt && { at: noticeAcceptedAt, by: signedInUserOf(ctx) };
      // The lock scans take before they add apps, so a connect and a scan never both add one.
      await appAccountRepository(tx).lockForSync();
      const connections = appConnectionRepository(tx);
      const app = await approveConnectedApp(ctx, tx, { key: connector, ...appFields });
      const sameConnector = await connections.findByConnector(connector);
      const sameApp = await connections.findByApps([app.id]);
      if (sameConnector || sameApp.length > 0) {
        throw new ApplicationError("CONFLICT", "This app is already connected.");
      }
      const id = await connections.newId();
      const encryptedSecrets = secretBox.encrypt(JSON.stringify(secrets), id);
      await connections.insert({
        id,
        connector,
        appId: app.id,
        settings,
        encryptedSecrets,
        noticeAccepted,
        sessionFrom,
      });
      await recordHistory.append(ctx, tx, {
        recordType: "app_connection",
        operation: "CREATED",
        cause: { kind: "EDITED_DIRECTLY" },
        records: [{ recordId: id, changes: connectionChanges(app, connection) }],
      });
      return { appId: app.id, connectionId: id };
    },
    async changeConnection(
      ctx,
      tx,
      connectionId,
      { settings, secrets, replacing, replacingRevision },
    ) {
      ctx.require("MANAGE_WORKSPACE");
      const connections = appConnectionRepository(tx);
      const old = await connections.lockById(connectionId);
      if (!old) {
        throw new ApplicationError("NOT_FOUND", "No app connection has this id.");
      }
      if (replacingRevision && !(await holdsRevision(tx, old, replacingRevision))) {
        return false;
      }
      if (replacing && !(await holdsSecrets(secretBox, tx, connectionId, replacing))) {
        return false;
      }
      const encryptedSecrets = secrets && secretBox.encrypt(JSON.stringify(secrets), connectionId);
      await connections.update(connectionId, { settings, encryptedSecrets });
      if (!settings || isDeepStrictEqual(settings, old.settings)) {
        return true;
      }
      await recordHistory.append(ctx, tx, {
        recordType: "app_connection",
        operation: "UPDATED",
        cause: { kind: "EDITED_DIRECTLY" },
        records: [
          {
            recordId: connectionId,
            changes: [
              {
                field: "settings",
                oldValue: JSON.stringify(old.settings),
                newValue: JSON.stringify(settings),
              },
            ],
          },
        ],
      });
      return true;
    },
    turnToReconnect: (ctx, tx, failure) => turnToReconnect(secretBox, ctx, tx, failure),
    syncIntegrationUserStops,
    reconnect: (ctx, tx, reconnection) => reconnect(secretBox, ctx, tx, reconnection),
    readReconnectReasons: (db, connectionIds) => readReconnectReasons(db, connectionIds),
    readConnection: (db, connector) => appConnectionRepository(db).findByConnector(connector),
    readConnections: (db) => appConnectionRepository(db).findAll(),
    async readCatalogAppsWithoutApp(db, catalogKeys) {
      const known = await appRepository(db).findByCatalogKeys(catalogKeys);
      const knownKeys = new Set(known.map(({ catalogKey }) => catalogKey));
      return catalogKeys
        .filter((key) => CATALOG_KEYS.has(key) && !knownKeys.has(key))
        .map(catalogApp);
    },
    readConnectionById: (db, connectionId) => appConnectionRepository(db).findById(connectionId),
    async readConnectionWithSecrets(db, connectionId) {
      const stored = await appConnectionRepository(db).findWithSecrets(connectionId);
      if (!stored) return null;
      const { encryptedSecrets, ...connection } = stored;
      const secrets = JSON.parse(secretBox.decrypt(encryptedSecrets, connectionId)) as Record<
        string,
        string
      >;
      return {
        connection,
        secrets,
        revision: connectionRevision(connection.settings, encryptedSecrets),
      };
    },
    async holdConnectionRevision(tx, connectionId, revision) {
      const connection = await appConnectionRepository(tx).lockById(connectionId);
      return connection !== null && holdsRevision(tx, connection, revision);
    },
    async readSecrets(db, connectionId) {
      const encrypted = await appConnectionRepository(db).findEncryptedSecrets(connectionId);
      return encrypted === null
        ? null
        : (JSON.parse(secretBox.decrypt(encrypted, connectionId)) as Record<string, string>);
    },
  };
}

/** The connector's app, approved or created approved, with its history line when it changes. */
async function approveConnectedApp(
  ctx: SecurityContext,
  tx: Tx,
  connector: { key: string; name: string; domain: string | null },
): Promise<App> {
  const repository = appRepository(tx);
  const match = connectedAppOf(await repository.findAll(), connector);
  if ("created" in match) {
    const [app] = await repository.insertMany([match.created], "approved");
    await appendAppHistory(ctx, tx, "CREATED", null, app!);
    return app!;
  }
  // Locked as Ignore locks it, so Ignore either runs first or sees the new connection.
  const before = (await repository.lockById(match.known.id))!;
  if (before.status === "approved") {
    return before;
  }
  const after: App = { ...before, status: "approved" };
  await repository.updateStatus([before.id], "approved");
  await appendAppHistory(ctx, tx, "UPDATED", before, after);
  return after;
}

async function appendAppHistory(
  ctx: SecurityContext,
  tx: Tx,
  operation: "CREATED" | "UPDATED",
  before: App | null,
  after: App,
): Promise<void> {
  await recordHistory.append(ctx, tx, {
    recordType: "app",
    operation,
    cause: { kind: "EDITED_DIRECTLY" },
    records: [{ recordId: after.id, changes: appChanges(before, after) }],
  });
}

/** A new connection's fields; its secrets never reach history. */
function connectionChanges(
  app: App,
  {
    connector,
    settings,
    noticeAcceptedAt,
    sessionFrom,
  }: {
    connector: string;
    settings: Record<string, unknown>;
    noticeAcceptedAt?: Date;
    sessionFrom?: AppSessionSource;
  },
): FieldChange[] {
  return [
    { field: "connector", oldValue: null, newValue: connector },
    { field: "app", oldValue: null, newValue: app.id, oldLabel: null, newLabel: app.name },
    { field: "settings", oldValue: null, newValue: JSON.stringify(settings) },
    ...(noticeAcceptedAt
      ? [{ field: "noticeAcceptedAt", oldValue: null, newValue: noticeAcceptedAt.toISOString() }]
      : []),
    ...(sessionFrom ? [{ field: "sessionFrom", oldValue: null, newValue: sessionFrom }] : []),
  ];
}

/** The user accepting a notice; only a signed-in user can, so the stored acceptance names them. */
function signedInUserOf(ctx: SecurityContext): string {
  if (!ctx.user) {
    throw new ApplicationError("FORBIDDEN", "Only a signed-in admin accepts a notice.");
  }
  return ctx.user.userId;
}

function connectionRevision(settings: Record<string, unknown>, encryptedSecrets: string): string {
  return createHash("sha256")
    .update(JSON.stringify([settings, encryptedSecrets]))
    .digest("base64url");
}

async function holdsRevision(
  tx: Tx,
  connection: AppConnection,
  revision: string,
): Promise<boolean> {
  const encrypted = await appConnectionRepository(tx).findEncryptedSecrets(connection.id);
  return encrypted !== null && connectionRevision(connection.settings, encrypted) === revision;
}
