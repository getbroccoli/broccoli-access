import { and, count, eq, inArray, type SQL, sql } from "drizzle-orm";

import {
  ACCOUNT_VALUES_VERSION,
  type ConnectorErrorCode,
  type ImportedAccount,
} from "../../../core/connectors";
import {
  anyOf,
  insertBatches,
  type Orm,
  ormOf,
  type OrmTransaction,
  type Tx,
} from "../../../core/db";
import type { ImportSource } from "../domain";
import { importRecords } from "./importRecordsTable";
import { importSources } from "./importSourcesTable";

/** Import sources and their records in Postgres, through the pool or inside a transaction. */
export interface ImportSourceRepository {
  findById(id: string): Promise<ImportSource | null>;
  /** Every source; an instance has one per connection. */
  findAll(): Promise<ImportSource[]>;
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
  removeMember(member: { connectionId: string; sourceKey: string; email: string }): Promise<void>;
  /** The accounts the source's last saved scan found. */
  findRecords(id: string): Promise<Pick<ImportedAccount, "sourceKey" | "raw">[]>;
  /** The email of the member with this stable source key, or null if absent from the scan. */
  findMemberEmail(connectionId: string, sourceKey: string): Promise<string | null>;
  /**
   * The source's account of the member whose key or session the connection uses; null without
   * one, as a version 1 record, which predates the flag, reads.
   */
  findConnectionUserEmail(connectionId: string): Promise<string | null>;
  /**
   * The members with one of `emails` that the last saved scan of one of `connectionIds` found; a
   * version 1 record, which predates the flag, reads as not the connection's user.
   */
  findConnectionMembers(members: {
    connectionIds: readonly string[];
    emails: readonly string[];
  }): Promise<ConnectionMember[]>;
  /** How many accounts the source's last saved scan found, and how many of them are suspended. */
  countRecords(id: string): Promise<{ accounts: number; suspended: number }>;
  markScanned(id: string, readAt: Date): Promise<void>;
  markFailed(id: string, failure: ConnectorErrorCode): Promise<void>;
}

/** A member of a connected app as its connection's last saved scan found it. */
export interface ConnectionMember {
  status: "active" | "suspended";
  displayName: string | null;
  connectionId: string;
  /** Lowercased. */
  email: string;
  sourceKey: string;
  isConnectionUser: boolean;
}

export function importSourceRepository(db: Orm | Tx): ImportSourceRepository {
  const orm = () => ormOf(db);
  return {
    findById: (id) => findSource(orm(), eq(importSources.id, id), { lock: false }),
    findAll: () => orm().select().from(importSources),
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
    removeMember: async ({ connectionId, sourceKey, email }) => {
      const source = orm()
        .select({ id: importSources.id })
        .from(importSources)
        .where(eq(importSources.connectionId, connectionId));
      await orm()
        .delete(importRecords)
        .where(
          and(
            inArray(importRecords.sourceId, source),
            eq(importRecords.sourceKey, sourceKey),
            sql`(${importRecords.values} ->> 'email') = ${email}`,
          ),
        );
    },
    findRecords: (id) =>
      orm()
        .select({
          sourceKey: importRecords.sourceKey,
          raw: importRecords.raw,
        })
        .from(importRecords)
        .where(eq(importRecords.sourceId, id)),
    findMemberEmail: async (connectionId, sourceKey) => {
      const [record] = await orm()
        .select({ email: sql<string>`${importRecords.values} ->> 'email'` })
        .from(importRecords)
        .innerJoin(importSources, eq(importSources.id, importRecords.sourceId))
        .where(
          and(eq(importSources.connectionId, connectionId), eq(importRecords.sourceKey, sourceKey)),
        );
      return record?.email ?? null;
    },
    findConnectionUserEmail: async (connectionId) => {
      const [record] = await orm()
        .select({
          email: sql<string>`${importRecords.values} ->> 'email'`,
        })
        .from(importRecords)
        .innerJoin(importSources, eq(importSources.id, importRecords.sourceId))
        .where(
          and(
            eq(importSources.connectionId, connectionId),
            // The builder has no JSON operators; the key is a constant.
            sql`(${importRecords.values} ->> 'isConnectionUser') = 'true'`,
          ),
        )
        .limit(1);
      return record?.email ?? null;
    },
    findConnectionMembers: ({ connectionIds, emails }) =>
      orm()
        .select({
          connectionId: importSources.connectionId,
          // The builder has no JSON operators; the keys are constants.
          email: sql<string>`${importRecords.values} ->> 'email'`,
          status: sql<ConnectionMember["status"]>`${importRecords.values} ->> 'status'`,
          displayName: sql<string | null>`${importRecords.values} ->> 'displayName'`,
          sourceKey: importRecords.sourceKey,
          isConnectionUser: sql<boolean>`coalesce((${importRecords.values} ->> 'isConnectionUser')::boolean, false)`,
        })
        .from(importRecords)
        .innerJoin(importSources, eq(importSources.id, importRecords.sourceId))
        .where(
          and(
            anyOf(importSources.connectionId, connectionIds),
            sql`(${importRecords.values} ->> 'email') = any(${sql.param([...emails])}::text[])`,
            // A record of another app, such as a Google sign-in's grant, is no member of this one.
            sql`(${importRecords.values} ->> 'appExternalId') is null`,
          ),
        ),
    countRecords: async (id) => {
      const [row] = await orm()
        .select({
          accounts: count(),
          // The builder has no JSON operators or filtered counts; the values are constants.
          suspended:
            sql<number>`count(*) filter (where ${importRecords.values} ->> 'status' = 'suspended')`.mapWith(
              Number,
            ),
        })
        .from(importRecords)
        .where(eq(importRecords.sourceId, id));
      return row!;
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
