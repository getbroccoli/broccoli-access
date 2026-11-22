import { eq, type SQL } from "drizzle-orm";

import {
  ACCOUNT_VALUES_VERSION,
  type ConnectorErrorCode,
  type ImportedAccount,
} from "../../../core/connectors";
import { insertBatches, type Orm, ormOf, type OrmTransaction, type Tx } from "../../../core/db";
import type { ImportSource } from "../domain";
import { importRecords } from "./importRecordsTable";
import { importSources } from "./importSourcesTable";

/** Import sources and their records in Postgres, through the pool or inside a transaction. */
export interface ImportSourceRepository {
  findById(id: string): Promise<ImportSource | null>;
  findByConnection(connectionId: string): Promise<ImportSource | null>;
  /** The connection's source, locked until the transaction ends; null when it has none. */
  lockByConnection(connectionId: string): Promise<ImportSource | null>;
  /** The source, locked until the transaction ends; null for an unknown id. */
  lockById(id: string): Promise<ImportSource | null>;
  /** Adds a connection's source with its first scan queued. */
  insertScanning(source: { connectionId: string; name: string }): Promise<ImportSource>;
  /** Queues another scan: `scanning`, keeping the last successful scan's records and time. */
  markScanning(id: string): Promise<void>;
  /** Makes the source's records exactly `accounts`. */
  replaceRecords(id: string, accounts: readonly ImportedAccount[]): Promise<void>;
  markScanned(id: string, readAt: Date): Promise<void>;
  markFailed(id: string, failure: ConnectorErrorCode): Promise<void>;
}

export function importSourceRepository(db: Orm | Tx): ImportSourceRepository {
  const orm = () => ormOf(db);
  return {
    findById: (id) => findSource(orm(), eq(importSources.id, id), { lock: false }),
    findByConnection: (connectionId) =>
      findSource(orm(), eq(importSources.connectionId, connectionId), { lock: false }),
    lockByConnection: (connectionId) =>
      findSource(orm(), eq(importSources.connectionId, connectionId), { lock: true }),
    lockById: (id) => findSource(orm(), eq(importSources.id, id), { lock: true }),
    insertScanning: async ({ connectionId, name }) => {
      const [source] = await orm()
        .insert(importSources)
        .values({ kind: "app_connection", connectionId, name, status: "scanning" })
        .returning();
      return source!;
    },
    markScanning: async (id) => {
      await orm()
        .update(importSources)
        .set({ status: "scanning", failure: null })
        .where(eq(importSources.id, id));
    },
    replaceRecords: async (id, accounts) => {
      await orm().delete(importRecords).where(eq(importRecords.sourceId, id));
      const rows = accounts.map(({ sourceKey, raw, values }) => ({
        sourceId: id,
        type: "app_account" as const,
        typeVersion: ACCOUNT_VALUES_VERSION,
        sourceKey,
        raw,
        values,
      }));
      for (const batch of insertBatches(rows)) {
        await orm().insert(importRecords).values(batch);
      }
    },
    markScanned: async (id, readAt) => {
      await orm()
        .update(importSources)
        .set({ status: "scanned", failure: null, readAt })
        .where(eq(importSources.id, id));
    },
    markFailed: async (id, failure) => {
      await orm()
        .update(importSources)
        .set({ status: "scan_failed", failure })
        .where(eq(importSources.id, id));
    },
  };
}

async function findSource(
  orm: Orm | OrmTransaction,
  where: SQL | undefined,
  { lock }: { lock: boolean },
): Promise<ImportSource | null> {
  const query = orm.select().from(importSources).where(where);
  const [source] = await (lock ? query.for("update") : query);
  return source ?? null;
}
