import type { AccountStatus } from "../../../core/connectors";

/** One of an employee's accounts, as the apps module reads it. */
export interface EmployeeAccount {
  employeeId: string;
  appName: string;
  appStatus: "discovered" | "approved" | "ignored";
  status: AccountStatus;
  /** Whether the app is the directory, such as Google Workspace. */
  inDirectory: boolean;
}

/** What an employee's accounts say about them, computed when read and never stored. */
export interface EmployeeAccess {
  /** Their directory account's status; null without one. */
  status: AccountStatus | null;
  /** The approved apps other than the directory where they have an active account, by name. */
  approvedAppNames: string[];
  /** Suspended in the directory with an active account in another approved app. */
  suspendedWithAccess: boolean;
}

/** The access of an employee without accounts. */
export const NO_ACCESS: EmployeeAccess = {
  status: null,
  approvedAppNames: [],
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
  const approvedAppNames = accounts
    .filter(givesAccess)
    .map(({ appName }) => appName)
    .sort((a, b) => a.localeCompare(b));
  return {
    status,
    approvedAppNames,
    suspendedWithAccess: status === "suspended" && approvedAppNames.length > 0,
  };
}

function givesAccess({ inDirectory, appStatus, status }: EmployeeAccount): boolean {
  return !inDirectory && appStatus === "approved" && status === "active";
}
