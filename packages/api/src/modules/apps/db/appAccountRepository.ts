import { and, arrayContains, eq, isNotNull, or } from "drizzle-orm";

import { anyOf, insertBatches, type Orm, ormOf, type Tx } from "../../../core/db";
import type { AppAccount } from "../domain";
import { appAccounts } from "./appAccountsTable";

/** App accounts in Postgres, through the pool or inside a transaction. */
export interface AppAccountRepository {
  /** The accounts in `appIds`, and those `findingKind` saw, whatever their app. */
  findInAppsOrFoundVia(appIds: readonly string[], findingKind: string): Promise<AppAccount[]>;
  insertMany(accounts: readonly Omit<AppAccount, "id">[]): Promise<AppAccount[]>;
  update(account: AppAccount): Promise<void>;
  deleteMany(ids: readonly string[]): Promise<void>;
  /** How many of the app's accounts belong to an employee, and how many of those are suspended. */
  countPeople(appId: string): Promise<{ people: number; suspended: number }>;
}

export function appAccountRepository(db: Orm | Tx): AppAccountRepository {
  const orm = () => ormOf(db);
  return {
    findInAppsOrFoundVia: (appIds, findingKind) =>
      orm()
        .select(columns)
        .from(appAccounts)
        .where(
          or(anyOf(appAccounts.appId, appIds), arrayContains(appAccounts.foundVia, [findingKind])),
        ),
    insertMany: async (accounts) => {
      const inserted: AppAccount[] = [];
      for (const batch of insertBatches(accounts)) {
        inserted.push(...(await orm().insert(appAccounts).values(batch).returning(columns)));
      }
      return inserted;
    },
    update: async ({ id, ...account }) => {
      await orm().update(appAccounts).set(account).where(eq(appAccounts.id, id));
    },
    deleteMany: async (ids) => {
      if (ids.length > 0) {
        await orm().delete(appAccounts).where(anyOf(appAccounts.id, ids));
      }
    },
    countPeople: async (appId) => {
      const people = and(eq(appAccounts.appId, appId), isNotNull(appAccounts.employeeId));
      const [total, suspended] = await Promise.all([
        orm().$count(appAccounts, people),
        orm().$count(appAccounts, and(people, eq(appAccounts.status, "suspended"))),
      ]);
      return { people: total, suspended };
    },
  };
}

const columns = {
  id: appAccounts.id,
  appId: appAccounts.appId,
  email: appAccounts.email,
  employeeId: appAccounts.employeeId,
  status: appAccounts.status,
  foundVia: appAccounts.foundVia,
  firstSeenAt: appAccounts.firstSeenAt,
};
