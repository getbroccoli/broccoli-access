import type { AccountStatus } from "../../../core/connectors";

/** One of an employee's accounts, as the apps module reads it. */
export interface EmployeeAccount {
  employeeId: string;
  appId: string;
  appName: string;
  /** The app's key in the built-in catalog, such as `slack`; null for another app. */
  catalogKey: string | null;
  appStatus: "discovered" | "approved" | "ignored";
  status: AccountStatus;
  /** Whether the app is the directory, such as Google Workspace. */
  inDirectory: boolean;
  /** The finding kinds that saw it, such as `google_sign_in`. */
  foundVia: string[];
  /** Since when they have had it; `before` when the grant is older than the log, which began at `at`. */
  since: { at: Date; before: boolean };
}

/** What an employee's accounts say about them, computed when read and never stored. */
export interface EmployeeAccess {
  /** Their directory account's status; null without one. */
  status: AccountStatus | null;
  /** Their active accounts in approved apps other than the directory, by app name. */
  currentAccess: AppAccess[];
  /** Suspended in the directory with an active account in another approved app. */
  suspendedWithAccess: boolean;
}

/** An approved app someone has an active account in, how the account was found and since when. */
export type AppAccess = Pick<EmployeeAccount, "appName" | "catalogKey" | "foundVia" | "since">;

/** The access of an employee without accounts. */
export const NO_ACCESS: EmployeeAccess = {
  status: null,
  currentAccess: [],
  suspendedWithAccess: false,
};

/** Each employee's access from their accounts, keyed by employee id; an employee without accounts is absent. */
export function accessOfEmployees(
  accounts: readonly EmployeeAccount[],
): Map<string, EmployeeAccess> {
  const byEmployee = Map.groupBy(accounts, ({ employeeId }) => employeeId);
  return new Map([...byEmployee].map(([employeeId, owned]) => [employeeId, accessOf(owned)]));
}

function accessOf(accounts: readonly EmployeeAccount[]): EmployeeAccess {
  const status = accounts.find(({ inDirectory }) => inDirectory)?.status ?? null;
  const byApp = Map.groupBy(accounts.filter(givesAccess), ({ appId }) => appId);
  const currentAccess = [...byApp.values()]
    .map((members) => {
      const earliest = members.reduce((one, other) =>
        one.since.at <= other.since.at ? one : other,
      );
      return {
        appName: earliest.appName,
        catalogKey: earliest.catalogKey,
        since: earliest.since,
        foundVia: [...new Set(members.flatMap(({ foundVia }) => foundVia))].sort(),
      };
    })
    .sort((a, b) => a.appName.localeCompare(b.appName));
  return {
    status,
    currentAccess,
    suspendedWithAccess: status === "suspended" && currentAccess.length > 0,
  };
}

function givesAccess({ inDirectory, appStatus, status }: EmployeeAccount): boolean {
  return !inDirectory && appStatus === "approved" && status === "active";
}
