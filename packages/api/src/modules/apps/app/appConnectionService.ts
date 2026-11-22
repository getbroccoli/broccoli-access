import { ApplicationError } from "../../../core/applicationError";
import type { Orm, Tx } from "../../../core/db";
import type { FieldChange } from "../../../core/records";
import { createRecordHistoryService } from "../../../core/records";
import type { SecretBox } from "../../../core/secrets";
import type { SecurityContext } from "../../../core/security";
import { type App, type AppConnection, appConnectionRepository, appRepository } from "../db";
import { appChanges, catalogApp } from "../domain";

const recordHistory = createRecordHistoryService();

/** Connected apps: the app itself, approved, and its connector's settings and secrets. */
export interface AppConnectionService {
  /**
   * Creates the catalog app `catalogKey`, approved, and saves its connection with `secrets`
   * encrypted under the connection's id, joining `tx`; appends the history of both. Admins only.
   */
  connectApp: (
    ctx: SecurityContext,
    tx: Tx,
    connection: {
      catalogKey: string;
      connector: string;
      settings: Record<string, unknown>;
      secrets: Record<string, string>;
    },
  ) => Promise<{ appId: string; connectionId: string }>;
  /**
   * Replaces the connection's settings and secrets, joining `tx`, and appends the settings' change
   * to its history, never the secrets. Admins only; refuses an unknown connection with NOT_FOUND.
   */
  changeConnection: (
    ctx: SecurityContext,
    tx: Tx,
    connectionId: string,
    connection: { settings: Record<string, unknown>; secrets: Record<string, string> },
  ) => Promise<void>;
  /** The connection of `connector` without its secrets, or null. Trusted read: no `ctx`. */
  readConnection: (db: Orm | Tx, connector: string) => Promise<AppConnection | null>;
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
    async connectApp(ctx, tx, { catalogKey, connector, settings, secrets }) {
      ctx.require("MANAGE_WORKSPACE");
      const app = await createApprovedApp(ctx, tx, catalogKey);
      const connections = appConnectionRepository(tx);
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
      const encryptedSecrets = secretBox.encrypt(JSON.stringify(secrets), connectionId);
      await connections.update(connectionId, { settings, encryptedSecrets });
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
    readConnectionById: (db, connectionId) => appConnectionRepository(db).findById(connectionId),
    async readSecrets(db, connectionId) {
      const encrypted = await appConnectionRepository(db).findEncryptedSecrets(connectionId);
      return encrypted === null
        ? null
        : (JSON.parse(secretBox.decrypt(encrypted, connectionId)) as Record<string, string>);
    },
  };
}

/** Creates the catalog app, approved, with its history line. */
async function createApprovedApp(ctx: SecurityContext, tx: Tx, catalogKey: string): Promise<App> {
  const app = await appRepository(tx).insertCatalogApp(catalogApp(catalogKey), "approved");
  await recordHistory.append(ctx, tx, {
    recordType: "app",
    operation: "CREATED",
    cause: { kind: "EDITED_DIRECTLY" },
    records: [{ recordId: app.id, changes: appChanges(null, app) }],
  });
  return app;
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
