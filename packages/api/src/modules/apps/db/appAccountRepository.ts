import { and, arrayContains, countDistinct, eq, isNotNull, or, sql } from "drizzle-orm";

import { anyOf, insertBatches, type Orm, ormOf, type Tx } from "../../../core/db";
import type { AppAccount, AppStatus } from "../domain";
import { appAccounts } from "./appAccountsTable";
import { appConnections } from "./appConnectionsTable";
import { apps } from "./appsTable";

/** App accounts in Postgres, through the pool or inside a transaction. */
export interface AppAccountRepository {
  /**
   * Waits for any other transaction that took this lock, then holds it until this transaction
   * ends, so account syncs and connects never interleave.
   */
  lockForSync(): Promise<void>;
  /** The accounts with these ids; an unknown id is left out. */
  findByIds(ids: readonly string[]): Promise<AppAccount[]>;
  /** The account, locked until the transaction ends; null for an unknown id. */
  lockById(id: string): Promise<AppAccount | null>;
  /** The accounts in `appIds`, and those `findingKind` saw, whatever their app. */
  findInAppsOrFoundVia(appIds: readonly string[], findingKind: string): Promise<AppAccount[]>;
  insertMany(accounts: readonly Omit<AppAccount, "id">[]): Promise<AppAccount[]>;
  update(account: AppAccount): Promise<void>;
  deleteMany(ids: readonly string[]): Promise<void>;
  /** How many of the app's accounts belong to an employee, and how many of those are suspended. */
  countPeople(appId: string): Promise<{ people: number; suspended: number }>;
  /** How many apps hold an account `findingKind` saw. */
  countAppsFoundVia(findingKind: string): Promise<number>;
  /** The accounts with an employee in `appIds`: the apps' users. */
  findUsersOfApps(appIds: readonly string[]): Promise<AppUserAccount[]>;
  /**
   * The employees' accounts in approved apps: the active ones, and the suspended ones in apps with
   * a connection; by app name.
   */
  findCurrentAccountsOfEmployees(employeeIds: readonly string[]): Promise<AppUserAccount[]>;
  /** How many employees hold an account in any app. */
  countEmployeesWithAccounts(): Promise<number>;
  /** The employees whose account in the app is suspended. */
  findSuspendedEmployeeIds(appId: string): Promise<string[]>;
  /** Every account with an employee, with its app's name and status and its dates. */
  findEmployeeAccounts(): Promise<EmployeeAppAccount[]>;
}

/** What the app list and an app's page read of a user's account. */
export interface AppUserAccount extends Pick<
  AppAccount,
  "id" | "appId" | "email" | "status" | "foundVia" | "grantedAt" | "grantedBefore" | "firstSeenAt"
> {
  employeeId: string;
}

/** An employee's account with its app's name and status, as People and a person's page read it. */
export interface EmployeeAppAccount extends Pick<
  AppAccount,
  "appId" | "status" | "foundVia" | "grantedAt" | "grantedBefore" | "firstSeenAt"
> {
  employeeId: string;
  appName: string;
  /** The app's key in the built-in catalog; null for another app. */
  catalogKey: string | null;
  appStatus: AppStatus;
}

export function appAccountRepository(db: Orm | Tx): AppAccountRepository {
  const orm = () => ormOf(db);
  return {
    lockForSync: async () => {
      // A table lock: the builder cannot express it. It blocks other writers, never readers.
      await orm().execute(sql`lock table ${appAccounts} in share row exclusive mode`);
    },
    findByIds: (ids) => orm().select(columns).from(appAccounts).where(anyOf(appAccounts.id, ids)),
    lockById: async (id) => {
      const [account] = await orm()
        .select(columns)
        .from(appAccounts)
        .where(eq(appAccounts.id, id))
        .for("update");
      return account ?? null;
    },
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
    countAppsFoundVia: async (findingKind) => {
      const [row] = await orm()
        .select({ apps: countDistinct(appAccounts.appId) })
        .from(appAccounts)
        .where(arrayContains(appAccounts.foundVia, [findingKind]));
      return row!.apps;
    },
    findUsersOfApps: (appIds) =>
      orm()
        .select(userColumns)
        .from(appAccounts)
        .where(and(anyOf(appAccounts.appId, appIds), isNotNull(appAccounts.employeeId))),
    findCurrentAccountsOfEmployees: (employeeIds) =>
      orm()
        .select(userColumns)
        .from(appAccounts)
        .innerJoin(apps, eq(apps.id, appAccounts.appId))
        .leftJoin(appConnections, eq(appConnections.appId, appAccounts.appId))
        .where(
          and(
            anyOf(appAccounts.employeeId, employeeIds),
            eq(apps.status, "approved"),
            or(eq(appAccounts.status, "active"), isNotNull(appConnections.id)),
          ),
        )
        .orderBy(apps.name, appAccounts.id),
    countEmployeesWithAccounts: async () => {
      const [row] = await orm()
        .select({ employees: countDistinct(appAccounts.employeeId) })
        .from(appAccounts);
      return row!.employees;
    },
    findSuspendedEmployeeIds: async (appId) => {
      const rows = await orm()
        .selectDistinct({ employeeId: appAccounts.employeeId })
        .from(appAccounts)
        .where(
          and(
            eq(appAccounts.appId, appId),
            eq(appAccounts.status, "suspended"),
            isNotNull(appAccounts.employeeId),
          ),
        );
      return rows.map(({ employeeId }) => employeeId!);
    },
    findEmployeeAccounts: () =>
      orm()
        .select({
          employeeId: sql<string>`${appAccounts.employeeId}`,
          appId: appAccounts.appId,
          appName: apps.name,
          catalogKey: apps.catalogKey,
          appStatus: apps.status,
          status: appAccounts.status,
          foundVia: appAccounts.foundVia,
          grantedAt: appAccounts.grantedAt,
          grantedBefore: appAccounts.grantedBefore,
          firstSeenAt: appAccounts.firstSeenAt,
        })
        .from(appAccounts)
        .innerJoin(apps, eq(apps.id, appAccounts.appId))
        .where(isNotNull(appAccounts.employeeId)),
  };
}

const columns = {
  id: appAccounts.id,
  appId: appAccounts.appId,
  email: appAccounts.email,
  employeeId: appAccounts.employeeId,
  status: appAccounts.status,
  foundVia: appAccounts.foundVia,
  grantedAt: appAccounts.grantedAt,
  grantedBefore: appAccounts.grantedBefore,
  firstSeenAt: appAccounts.firstSeenAt,
};

const userColumns = {
  id: appAccounts.id,
  appId: appAccounts.appId,
  email: appAccounts.email,
  // Never null: the queries keep only accounts with an employee.
  employeeId: sql<string>`${appAccounts.employeeId}`,
  status: appAccounts.status,
  foundVia: appAccounts.foundVia,
  grantedAt: appAccounts.grantedAt,
  grantedBefore: appAccounts.grantedBefore,
  firstSeenAt: appAccounts.firstSeenAt,
};
