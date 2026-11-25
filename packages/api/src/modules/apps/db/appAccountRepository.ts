import { and, arrayContains, count, countDistinct, eq, isNotNull, or, sql } from "drizzle-orm";

import { z } from "zod";
import type { KeysetQuery, KeysetRow } from "../../../core/pagination";
import type { AccountStatus } from "../../../core/connectors";
import {
  afterKeyset,
  anyOf,
  keysetOrder,
  orderByKeyset,
  insertBatches,
  type Orm,
  ormOf,
  type Tx,
} from "../../../core/db";
import type { AppAccount, AppStatus, InAppFacts } from "../domain";
import { type AppUserAccount, inApp, isAccess, unlinkedAccounts } from "./inApp";
import { appAccounts } from "./appAccountsTable";
import { appConnections } from "./appConnectionsTable";
import type { App } from "./appRepository";
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
  findByAppAndEmails(appId: string, emails: readonly string[]): Promise<AppAccount[]>;
  /** The account, locked until the transaction ends; null for an unknown id. */
  lockById(
    id: string,
    facts?: InAppFacts,
  ): Promise<(AppAccount & { inApp: boolean | null }) | null>;
  /** The accounts in `appIds`, and those `findingKind` saw, whatever their app. */
  findInAppsOrFoundVia(appIds: readonly string[], findingKind: string): Promise<AppAccount[]>;
  /** One page of unlinked personal or marked accounts in approved apps, by email and id. */
  findUnlinkedAccounts(
    query: KeysetQuery<"EMAIL", unknown[]>,
    facts: InAppFacts,
    group: "personal" | "marked",
  ): Promise<KeysetRow<UnlinkedAccount, unknown[]>[]>;
  /** The accounts the owner linked to these employees, including private email addresses. */
  findOwnerLinks(
    employeeIds: readonly string[],
    appIds: readonly string[],
  ): Promise<{ employeeId: string; email: string; appId: string }[]>;
  countWithoutPerson(facts: InAppFacts): Promise<number>;
  insertMany(accounts: readonly Omit<AppAccount, "id">[]): Promise<AppAccount[]>;
  update(account: AppAccount): Promise<void>;
  deleteMany(ids: readonly string[]): Promise<void>;
  /** How many of the app's accounts belong to an employee, and how many of those are suspended. */
  countPeople(appId: string): Promise<{ people: number; suspended: number }>;
  /** How many apps hold an account `findingKind` saw. */
  countAppsFoundVia(findingKind: string): Promise<number>;
  /** The accounts with an employee in `appIds`, each in its app or not as `facts` say. */
  findUsersOfApps(
    appIds: readonly string[],
    facts: InAppFacts,
    accountIds?: readonly string[],
  ): Promise<AppUserAccount[]>;
  /**
   * The employees' accounts in approved apps that are access as `facts` say: the active ones, and
   * the suspended ones in apps with a connection; by app name.
   */
  findCurrentAccountsOfEmployees(
    employeeIds: readonly string[],
    facts: InAppFacts,
    appIds?: readonly string[],
  ): Promise<AppUserAccount[]>;
  /** How many employees hold an account in any app. */
  countEmployeesWithAccounts(): Promise<number>;
  /** The employees whose account matches the app and status when given; only those of `among` when given. */
  findEmployeeIdsWithStatus(
    appId: string | null,
    status: AccountStatus | null,
    among?: readonly string[],
  ): Promise<string[]>;
  /**
   * Every account with an employee that is access as `facts` say, with its app's name and status
   * and its dates.
   */
  findEmployeeAccounts(
    facts: InAppFacts,
    employeeIds?: readonly string[],
    appIds?: readonly string[],
  ): Promise<EmployeeAppAccount[]>;
}

export type UnlinkedAccount = Pick<AppAccount, "id" | "email" | "status" | "kind" | "note"> & {
  app: App;
  connectionId: string | null;
};
export const UNLINKED_SORT_VALUES: Record<"EMAIL", z.ZodType<unknown[]>> = {
  EMAIL: z.tuple([z.string(), z.uuid()]),
};

/** An employee's account with its app's name and status, as People and a person's page read it. */
export interface EmployeeAppAccount extends Pick<
  AppAccount,
  "id" | "appId" | "status" | "foundVia" | "grantedAt" | "grantedBefore" | "firstSeenAt"
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
    findByAppAndEmails: (appId, emails) =>
      orm()
        .select(columns)
        .from(appAccounts)
        .where(and(eq(appAccounts.appId, appId), anyOf(appAccounts.email, emails))),
    lockById: async (id, facts) => {
      const [account] = await orm()
        .select({ ...columns, inApp: facts ? inApp(facts) : sql<null>`null` })
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
    findUnlinkedAccounts: async ({ after, limit }, facts, group) => {
      const rows = await orm()
        .select({
          id: appAccounts.id,
          email: appAccounts.email,
          status: appAccounts.status,
          kind: appAccounts.kind,
          note: appAccounts.note,
          app: apps,
          connectionId: appConnections.id,
        })
        .from(appAccounts)
        .innerJoin(apps, eq(apps.id, appAccounts.appId))
        .leftJoin(appConnections, eq(appConnections.appId, apps.id))
        .where(
          and(unlinkedAccounts(facts, group), after ? afterKeyset(EMAIL_ORDER, after) : undefined),
        )
        .orderBy(...orderByKeyset(EMAIL_ORDER))
        .limit(limit);
      return rows.map((node) => ({ node, values: [node.email, node.id] }));
    },
    findOwnerLinks: (employeeIds, appIds) =>
      orm()
        .select({
          employeeId: sql<string>`${appAccounts.employeeId}`,
          email: appAccounts.email,
          appId: appAccounts.appId,
        })
        .from(appAccounts)
        .where(
          and(
            anyOf(appAccounts.employeeId, employeeIds),
            anyOf(appAccounts.appId, appIds),
            eq(appAccounts.employeeLinkedBy, "owner"),
          ),
        ),
    countWithoutPerson: async (facts) => {
      const [row] = await orm()
        .select({ total: count() })
        .from(appAccounts)
        .innerJoin(apps, eq(apps.id, appAccounts.appId))
        .where(unlinkedAccounts(facts, "personal"));
      return row!.total;
    },
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
      const [row] = await orm()
        .select({
          people: countDistinct(appAccounts.employeeId),
          suspended:
            sql<number>`count(distinct ${appAccounts.employeeId}) filter (where ${appAccounts.status} = 'suspended')`.mapWith(
              Number,
            ),
        })
        .from(appAccounts)
        .where(people);
      return row!;
    },
    countAppsFoundVia: async (findingKind) => {
      const [row] = await orm()
        .select({ apps: countDistinct(appAccounts.appId) })
        .from(appAccounts)
        .where(arrayContains(appAccounts.foundVia, [findingKind]));
      return row!.apps;
    },
    findUsersOfApps: (appIds, facts, accountIds) =>
      orm()
        .select(userColumns(facts))
        .from(appAccounts)
        .where(
          and(
            anyOf(appAccounts.appId, appIds),
            isNotNull(appAccounts.employeeId),
            accountIds && anyOf(appAccounts.id, accountIds),
          ),
        ),
    findCurrentAccountsOfEmployees: (employeeIds, facts, appIds) =>
      orm()
        .select(userColumns(facts))
        .from(appAccounts)
        .innerJoin(apps, eq(apps.id, appAccounts.appId))
        .leftJoin(appConnections, eq(appConnections.appId, appAccounts.appId))
        .where(
          and(
            anyOf(appAccounts.employeeId, employeeIds),
            appIds && anyOf(appAccounts.appId, appIds),
            eq(apps.status, "approved"),
            or(eq(appAccounts.status, "active"), isNotNull(appConnections.id)),
            isAccess(facts),
          ),
        )
        .orderBy(apps.name, appAccounts.id),
    countEmployeesWithAccounts: async () => {
      const [row] = await orm()
        .select({ employees: countDistinct(appAccounts.employeeId) })
        .from(appAccounts);
      return row!.employees;
    },
    findEmployeeIdsWithStatus: async (appId, status, among) => {
      const rows = await orm()
        .selectDistinct({ employeeId: appAccounts.employeeId })
        .from(appAccounts)
        .where(
          and(
            appId === null ? undefined : eq(appAccounts.appId, appId),
            status === null ? undefined : eq(appAccounts.status, status),
            among ? anyOf(appAccounts.employeeId, among) : isNotNull(appAccounts.employeeId),
          ),
        );
      return rows.map(({ employeeId }) => employeeId!);
    },
    findEmployeeAccounts: (facts, employeeIds, appIds) =>
      orm()
        .select({
          id: appAccounts.id,
          employeeId: sql<string>`${appAccounts.employeeId}`,
          appId: appAccounts.appId,
          appName: apps.name,
          catalogKey: apps.catalogKey,
          appStatus: apps.status,
          ...accessColumns,
        })
        .from(appAccounts)
        .innerJoin(apps, eq(apps.id, appAccounts.appId))
        .where(
          and(
            employeeIds
              ? anyOf(appAccounts.employeeId, employeeIds)
              : isNotNull(appAccounts.employeeId),
            appIds ? anyOf(appAccounts.appId, appIds) : undefined,
            isAccess(facts),
          ),
        ),
  };
}

const EMAIL_ORDER = keysetOrder(
  [{ expression: sql`${appAccounts.email}`, descending: false }],
  sql`${appAccounts.id}`,
  false,
);

const accessColumns = {
  status: appAccounts.status,
  foundVia: appAccounts.foundVia,
  grantedAt: appAccounts.grantedAt,
  grantedBefore: appAccounts.grantedBefore,
  firstSeenAt: appAccounts.firstSeenAt,
};

const columns = {
  id: appAccounts.id,
  appId: appAccounts.appId,
  email: appAccounts.email,
  employeeId: appAccounts.employeeId,
  employeeLinkedBy: appAccounts.employeeLinkedBy,
  kind: appAccounts.kind,
  note: appAccounts.note,
  ...accessColumns,
};

function userColumns(facts: InAppFacts) {
  return {
    id: appAccounts.id,
    appId: appAccounts.appId,
    email: appAccounts.email,
    // Never null: the queries keep only accounts with an employee.
    employeeId: sql<string>`${appAccounts.employeeId}`,
    ...accessColumns,
    inApp: inApp(facts),
  };
}
