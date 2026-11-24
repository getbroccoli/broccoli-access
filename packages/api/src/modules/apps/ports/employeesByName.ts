import type { Orm, Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";

/** What apps need from the employees module: their order by name, and the emails invites go to. */
export interface EmployeesByName {
  /** The employees with these ids the caller may read, sorted by name; an unknown id is left out. */
  readEmployees(
    ctx: SecurityContext,
    ids: readonly string[],
    db?: Orm | Tx,
  ): Promise<{ id: string; email: string; firstName: string; lastName: string }[]>;
}
