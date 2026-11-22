import type { Orm, Tx } from "../../../core/db";
import type { FieldChange } from "../../../core/records";
import { createRecordHistoryService } from "../../../core/records";
import type { SecretBox } from "../../../core/secrets";
import type { SecurityContext } from "../../../core/security";
import { type App, type AppConnection, appConnectionRepository, appRepository } from "../db";
import { catalogApp } from "../domain";

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
  /** The connection of `connector` without its secrets, or null. Trusted read: no `ctx`. */
  readConnection: (db: Orm | Tx, connector: string) => Promise<AppConnection | null>;
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
    readConnection: (db, connector) => appConnectionRepository(db).findByConnector(connector),
  };
}

/** Creates the catalog app, approved, with its history line. */
async function createApprovedApp(ctx: SecurityContext, tx: Tx, catalogKey: string): Promise<App> {
  const app = await appRepository(tx).insertCatalogApp(catalogApp(catalogKey), "approved");
  await recordHistory.append(ctx, tx, {
    recordType: "app",
    operation: "CREATED",
    cause: { kind: "EDITED_DIRECTLY" },
    records: [
      {
        recordId: app.id,
        changes: [
          { field: "name", oldValue: null, newValue: app.name },
          { field: "domain", oldValue: null, newValue: app.domain },
          { field: "catalogKey", oldValue: null, newValue: app.catalogKey },
          { field: "status", oldValue: null, newValue: app.status },
        ],
      },
    ],
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
