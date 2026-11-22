import type { Orm, Tx } from "../../../core/db";
import type { EmployeeAccount } from "../domain";

/** What the employees module reads from the apps module: employees' accounts in apps. */
export interface EmployeeAccounts {
  /** Every account that belongs to an employee, with its app's name and status. */
  findEmployeeAccounts(db: Orm | Tx): Promise<EmployeeAccount[]>;
}
