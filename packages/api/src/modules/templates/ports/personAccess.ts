import type { AccountStatus } from "../../../core/connectors";
import type { Orm, Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";

/** The accounts and outstanding invitations that the apps module recognises as belonging to a person. */
export interface PersonAccess {
  findEmployeeAccounts(
    db: Orm | Tx,
    employeeIds: readonly string[],
  ): Promise<
    {
      employeeId: string;
      appId: string;
      inDirectory: boolean;
      status: AccountStatus;
    }[]
  >;
  readAppInvites(
    ctx: SecurityContext,
    employeeIds: readonly string[],
  ): Promise<
    {
      employeeId: string;
      appId: string;
      invitedAt: Date | null;
    }[]
  >;
}

/** Used to distinguish a missing employee from an employee without a directory account. */
export interface EmployeeById {
  readEmployee(ctx: SecurityContext, id: string): Promise<{ id: string } | null>;
}
