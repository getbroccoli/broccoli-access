import type { SecurityContext } from "../../../core/security";

/** What an app's users need from the employees module: their order by name. */
export interface EmployeesByName {
  /** The employees with these ids the caller may read, sorted by name; an unknown id is left out. */
  readEmployees(ctx: SecurityContext, ids: readonly string[]): Promise<{ id: string }[]>;
}
