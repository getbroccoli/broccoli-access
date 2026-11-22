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
   * Approves the catalog app `catalogKey`, creating it when missing, and saves its connection with
   * `secrets` encrypted under the connection's id, joining `tx`; appends the history of both.
   * Admins only.
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
      const app = await approveCatalogApp(ctx, tx, catalogKey);
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

/** The catalog app, created or moved to approved, with its history line; unchanged when approved. */
async function approveCatalogApp(ctx: SecurityContext, tx: Tx, catalogKey: string): Promise<App> {
  const repository = appRepository(tx);
  const existing = await repository.lockByCatalogKey(catalogKey);
  if (existing?.status === "approved") {
    return existing;
  }
  if (existing) {
    await repository.setStatus(existing.id, "approved");
    await appendAppHistory(ctx, tx, existing.id, "UPDATED", [
      { field: "status", oldValue: existing.status, newValue: "approved" },
    ]);
    return { ...existing, status: "approved" };
  }
  const created = await repository.insertCatalogApp(catalogApp(catalogKey), "approved");
  await appendAppHistory(ctx, tx, created.id, "CREATED", [
    { field: "name", oldValue: null, newValue: created.name },
    { field: "domain", oldValue: null, newValue: created.domain },
    { field: "catalogKey", oldValue: null, newValue: created.catalogKey },
    { field: "status", oldValue: null, newValue: created.status },
  ]);
  return created;
}

async function appendAppHistory(
  ctx: SecurityContext,
  tx: Tx,
  appId: string,
  operation: "CREATED" | "UPDATED",
  changes: FieldChange[],
): Promise<void> {
  await recordHistory.append(ctx, tx, {
    recordType: "app",
    operation,
    cause: { kind: "EDITED_DIRECTLY" },
    records: [{ recordId: appId, changes }],
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
