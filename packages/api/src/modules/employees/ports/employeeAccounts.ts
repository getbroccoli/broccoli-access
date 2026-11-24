import type { Orm, Tx } from "../../../core/db";
import type { EmployeeAccount } from "../domain";

/** What the employees module reads from the apps module: employees' accounts in apps. */
export interface EmployeeAccounts {
  /** The attached employee, if any, for each of these app accounts. */
  findAccountOwners(
    db: Orm | Tx,
    ids: readonly string[],
  ): Promise<{ id: string; employeeId: string | null }[]>;
  /** Every account that belongs to an employee, with its app's name and status. */
  findEmployeeAccounts(db: Orm | Tx): Promise<EmployeeAccount[]>;
}
