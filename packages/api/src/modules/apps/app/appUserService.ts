import type { AccountStatus } from "../../../core/connectors";
import type { Orm } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { appAccountRepository, type AppUserAccount } from "../db";
import { accountSince, type Since } from "../domain";
import type { ConnectionMembers, EmployeesByName } from "../ports";
import {
  type DirectoryConnectors,
  findDirectoryAppId,
  findEmployeesInDirectory,
} from "./directory";
import { findInAppFacts } from "./inAppFacts";

/** An app's users: its accounts that belong to an employee. */
export interface AppUserService {
  /**
   * The apps' users whose employee the caller may read, each app's users suspended in the
   * directory first, then by name, then those not in the app. Needs MANAGE_WORKSPACE.
   */
  readUsersOfApps: (ctx: SecurityContext, appIds: readonly string[]) => Promise<AppUser[]>;
  /**
   * The employees' accounts in approved apps other than the directory that are in their app: the
   * active ones, and the suspended ones in apps with a connection; by app name. Needs
   * MANAGE_WORKSPACE.
   */
  readUsersOfEmployees: (
    ctx: SecurityContext,
    employeeIds: readonly string[],
  ) => Promise<AppUser[]>;
}

/** An account in an app that belongs to an employee. */
export interface AppUser {
  /** The account's id. */
  id: string;
  appId: string;
  employeeId: string;
  /** The account's email, lowercased. */
  email: string;
  /** Whether the person may use the account in the app. */
  status: AccountStatus;
  /** Whether the employee's account in the directory is suspended. */
  suspendedInDirectory: boolean;
  /**
   * Whether its app's connection's last scan returned it; null without a connection or before its
   * first scan finished. An account that is not in its app is no access.
   */
  inApp: boolean | null;
  /** The finding kinds that saw the account, sorted, such as `google_sign_in`. */
  foundVia: string[];
  since: Since;
}

interface AppUserDependencies {
  orm: Orm;
  /** The imports module, which knows which connections have finished a scan. */
  members: ConnectionMembers;
  /** The core's own connectors; the one whose `isDirectory` is set names the directory. */
  connectors: DirectoryConnectors;
  /** The employees module, which owns their names and so their order. */
  employees: EmployeesByName;
}

export function createAppUserService(dependencies: AppUserDependencies): AppUserService {
  const { orm, connectors, employees } = dependencies;
  return {
    // shortcut: reads every user of the apps unpaged, since their order needs the employees'
    // names, even when the app list keeps only its first four avatars per app; page them, or read
    // only the first few per app, once a directory can be very large (left out of circle 1).
    async readUsersOfApps(ctx, appIds) {
      ctx.require("MANAGE_WORKSPACE");
      const inAppFacts = await findInAppFacts(orm, dependencies);
      const [accounts, suspended] = await Promise.all([
        appAccountRepository(orm).findUsersOfApps(appIds, inAppFacts),
        findEmployeesInDirectory(orm, connectors, { status: "suspended" }),
      ]);
      const byName = await employees.readEmployees(ctx, [
        ...new Set(accounts.map(({ employeeId }) => employeeId)),
      ]);
      const nameRanks = new Map(byName.map(({ id }, rank) => [id, rank]));
      const nameRank = (user: AppUser) => nameRanks.get(user.employeeId)!;
      const suspendedInDirectory = new Set(suspended);
      return accounts
        .filter(({ employeeId }) => nameRanks.has(employeeId))
        .map((account) => toAppUser(account, suspendedInDirectory))
        .sort(
          (one, other) =>
            Number(one.inApp === false) - Number(other.inApp === false) ||
            Number(other.suspendedInDirectory) - Number(one.suspendedInDirectory) ||
            nameRank(one) - nameRank(other),
        );
    },
    async readUsersOfEmployees(ctx, employeeIds) {
      ctx.require("MANAGE_WORKSPACE");
      const inAppFacts = await findInAppFacts(orm, dependencies);
      const [accounts, suspended, directoryAppId] = await Promise.all([
        appAccountRepository(orm).findCurrentAccountsOfEmployees(employeeIds, inAppFacts),
        findEmployeesInDirectory(orm, connectors, { status: "suspended" }),
        findDirectoryAppId(orm, connectors),
      ]);
      const suspendedInDirectory = new Set(suspended);
      return accounts
        .filter(({ appId }) => appId !== directoryAppId)
        .map((account) => toAppUser(account, suspendedInDirectory));
    },
  };
}

function toAppUser(account: AppUserAccount, suspendedInDirectory: ReadonlySet<string>): AppUser {
  const { id, appId, employeeId, email, status, foundVia, inApp } = account;
  return {
    id,
    appId,
    employeeId,
    email,
    status,
    suspendedInDirectory: suspendedInDirectory.has(employeeId),
    inApp,
    foundVia: foundVia.toSorted(),
    since: accountSince(account),
  };
}
