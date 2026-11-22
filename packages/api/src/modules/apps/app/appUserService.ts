import type { Orm } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { appAccountRepository, type AppUserAccount } from "../db";
import { accountSince, type Since } from "../domain";
import type { EmployeesByName } from "../ports";
import { type DirectoryConnectors, findEmployeesSuspendedInDirectory } from "./directory";

/** An app's users: its accounts that belong to an employee. */
export interface AppUserService {
  /**
   * The apps' users whose employee the caller may read, each app's users suspended in the
   * directory first, then by name. Needs MANAGE_WORKSPACE.
   */
  readUsersOfApps: (ctx: SecurityContext, appIds: readonly string[]) => Promise<AppUser[]>;
}

/** An account in an app that belongs to an employee. */
export interface AppUser {
  /** The account's id. */
  id: string;
  appId: string;
  employeeId: string;
  /** The account's email, lowercased. */
  email: string;
  /** Whether the employee's account in the directory is suspended. */
  suspendedInDirectory: boolean;
  /** The finding kinds that saw the account, sorted, such as `google_sign_in`. */
  foundVia: string[];
  since: Since;
}

interface AppUserDependencies {
  orm: Orm;
  connectors: DirectoryConnectors;
  /** The employees module, which owns their names and so their order. */
  employees: EmployeesByName;
}

export function createAppUserService({
  orm,
  connectors,
  employees,
}: AppUserDependencies): AppUserService {
  return {
    // shortcut: reads every user of the apps unpaged, since their order needs the employees'
    // names, even when the app list keeps only its first four avatars per app; page them, or read
    // only the first few per app, once a directory can be very large (left out of circle 1).
    async readUsersOfApps(ctx, appIds) {
      ctx.require("MANAGE_WORKSPACE");
      const [accounts, suspended] = await Promise.all([
        appAccountRepository(orm).findUsersOfApps(appIds),
        findEmployeesSuspendedInDirectory(orm, connectors),
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
            Number(other.suspendedInDirectory) - Number(one.suspendedInDirectory) ||
            nameRank(one) - nameRank(other),
        );
    },
  };
}

function toAppUser(account: AppUserAccount, suspendedInDirectory: ReadonlySet<string>): AppUser {
  const { id, appId, employeeId, email, foundVia } = account;
  return {
    id,
    appId,
    employeeId,
    email,
    suspendedInDirectory: suspendedInDirectory.has(employeeId),
    foundVia: foundVia.toSorted(),
    since: accountSince(account),
  };
}
