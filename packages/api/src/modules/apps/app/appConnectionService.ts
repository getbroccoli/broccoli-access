import { isDeepStrictEqual } from "node:util";

import { ApplicationError } from "../../../core/applicationError";
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

const recordHistory = createRecordHistoryService();

/** Connected apps: the app itself, approved, and its connector's settings and secrets. */
export interface AppConnectionService {
  /**
   * Approves the connector's app (the app with the connector's key as catalog key, else its name,
   * else a new one) and saves its connection with `secrets` encrypted under the connection's id,
   * joining `tx`; appends the history of both. Connects and scan saves run one at a time. Admins
   * only; refuses
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
    },
  ) => Promise<{ appId: string; connectionId: string }>;
  /**
   * Replaces the connection's settings or secrets, whichever `update` carries, joining `tx`; new
   * settings add a line to its history, secrets never. Admins only; refuses an unknown connection
   * with NOT_FOUND.
   */
  changeConnection: (
    ctx: SecurityContext,
    tx: Tx,
    connectionId: string,
    update: { settings?: Record<string, unknown>; secrets?: Record<string, unknown> },
  ) => Promise<void>;
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
    async connectApp(ctx, tx, { connector, app: appFields, settings, secrets }) {
      ctx.require("MANAGE_WORKSPACE");
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
      await connections.insert({ id, connector, appId: app.id, settings, encryptedSecrets });
      await recordHistory.append(ctx, tx, {
        recordType: "app_connection",
        operation: "CREATED",
        cause: { kind: "EDITED_DIRECTLY" },
        records: [{ recordId: id, changes: connectionChanges(connector, app, settings) }],
      });
      return { appId: app.id, connectionId: id };
    },
    async changeConnection(ctx, tx, connectionId, { settings, secrets }) {
      ctx.require("MANAGE_WORKSPACE");
      const connections = appConnectionRepository(tx);
      const old = await connections.lockById(connectionId);
      if (!old) {
        throw new ApplicationError("NOT_FOUND", "No app connection has this id.");
      }
      const encryptedSecrets = secrets && secretBox.encrypt(JSON.stringify(secrets), connectionId);
      await connections.update(connectionId, { settings, encryptedSecrets });
      if (!settings || isDeepStrictEqual(settings, old.settings)) {
        return;
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
    },
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
  connector: string,
  app: App,
  settings: Record<string, unknown>,
): FieldChange[] {
  return [
    { field: "connector", oldValue: null, newValue: connector },
    { field: "app", oldValue: null, newValue: app.id, oldLabel: null, newLabel: app.name },
    { field: "settings", oldValue: null, newValue: JSON.stringify(settings) },
  ];
}
