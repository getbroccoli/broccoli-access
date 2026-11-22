import { count, eq, sql } from "drizzle-orm";
import { z } from "zod";

import {
  afterKeyset,
  anyOf,
  insertBatches,
  keysetOrder,
  type Orm,
  orderByKeyset,
  ormOf,
  type Tx,
} from "../../../core/db";
import type { KeysetQuery, KeysetRow } from "../../../core/pagination";
import { APP_STATUSES, type AppStatus, type NewApp } from "../domain";
import { appAccounts } from "./appAccountsTable";
import { apps } from "./appsTable";

/** An app as stored. */
export interface App {
  id: string;
  name: string;
  domain: string | null;
  catalogKey: string | null;
  externalIds: string[];
  status: AppStatus;
  createdAt: Date;
}

/** Apps in Postgres, through the pool or inside a transaction. */
export interface AppRepository {
  insertMany(apps: readonly NewApp[], status: AppStatus): Promise<App[]>;
  findAll(): Promise<App[]>;
  updateExternalIds(id: string, externalIds: readonly string[]): Promise<void>;
  /** One page of the apps with `status`, the most people first, then by name. */
  findPage(query: AppPageQuery): Promise<KeysetRow<App, unknown[]>[]>;
  /** How many apps have each status. */
  countByStatus(): Promise<Record<AppStatus, number>>;
  /** The app; null when there is none. */
  findById(id: string): Promise<App | null>;
  /** The app, locked until the transaction ends; null when there is none. */
  lockById(id: string): Promise<App | null>;
  /** The apps with `status`, locked until the transaction ends. */
  lockByStatus(status: AppStatus): Promise<App[]>;
  updateStatus(ids: readonly string[], status: AppStatus): Promise<void>;
}

/** The app list's one order: its sort values are the people count, the lowercased name and the id. */
export const APP_SORT_VALUES: Record<"PEOPLE", z.ZodType<unknown[]>> = {
  PEOPLE: z.tuple([z.number().int(), z.string(), z.uuid()]),
};

export interface AppPageQuery extends KeysetQuery<keyof typeof APP_SORT_VALUES, unknown[]> {
  status: AppStatus;
}

export function appRepository(db: Orm | Tx): AppRepository {
  const orm = () => ormOf(db);
  return {
    insertMany: async (newApps, status) => {
      const inserted: App[] = [];
      for (const batch of insertBatches(newApps)) {
        const values = batch.map((app) => ({ ...app, status }));
        inserted.push(...(await orm().insert(apps).values(values).returning()));
      }
      return inserted;
    },
    findAll: () => orm().select().from(apps),
    updateExternalIds: async (id, externalIds) => {
      await orm()
        .update(apps)
        .set({ externalIds: [...externalIds] })
        .where(eq(apps.id, id));
    },
    findPage: async ({ status, after, limit }) => {
      const rows = await orm()
        .select({ app: apps, people: PEOPLE, name: LOWERCASE_NAME })
        .from(apps)
        .leftJoin(appAccounts, eq(appAccounts.appId, apps.id))
        .where(eq(apps.status, status))
        .groupBy(apps.id)
        .having(after ? afterKeyset(PAGE_ORDER, after) : undefined)
        .orderBy(...orderByKeyset(PAGE_ORDER))
        .limit(limit);
      return rows.map(({ app, people, name }) => ({ node: app, values: [people, name, app.id] }));
    },
    countByStatus: async () => {
      const rows = await orm()
        .select({ status: apps.status, apps: count() })
        .from(apps)
        .groupBy(apps.status);
      return Object.fromEntries(
        APP_STATUSES.map((status) => [
          status,
          rows.find((row) => row.status === status)?.apps ?? 0,
        ]),
      ) as Record<AppStatus, number>;
    },
    findById: async (id) => {
      const [app] = await orm().select().from(apps).where(eq(apps.id, id));
      return app ?? null;
    },
    lockById: async (id) => {
      const [app] = await orm().select().from(apps).where(eq(apps.id, id)).for("update");
      return app ?? null;
    },
    lockByStatus: (status) =>
      orm().select().from(apps).where(eq(apps.status, status)).for("update"),
    updateStatus: async (ids, status) => {
      if (ids.length > 0) {
        await orm().update(apps).set({ status }).where(anyOf(apps.id, ids));
      }
    },
  };
}

/** An app's people: its accounts with an employee. */
const PEOPLE = count(appAccounts.employeeId);

const LOWERCASE_NAME = sql<string>`lower(${apps.name})`;

const PAGE_ORDER = keysetOrder(
  [
    { expression: PEOPLE, descending: true },
    { expression: LOWERCASE_NAME, descending: false },
  ],
  sql`${apps.id}`,
  false,
);
