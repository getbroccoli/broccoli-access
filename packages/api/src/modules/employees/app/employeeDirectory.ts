import type { Orm, Tx } from "../../../core/db";
import { createOwnerService } from "../../../core/instance";
import type { EmployeeDirectory } from "../../../core/security";
import { employeeRepository } from "../db";

const owners = createOwnerService();

/** What permission checks read about people: who a user is; in `db`. */
export function employeeDirectory(db: Orm | Tx): EmployeeDirectory {
  const employees = employeeRepository(db);
  const employeeIdOfUser = async (userId: string) =>
    (await employees.findByUserId(userId))?.id ?? null;
  return {
    employeeIdOfUser,
    ownersEmployeeId: async () => {
      const owner = await owners.readOwner(db);
      return owner ? employeeIdOfUser(owner.userId) : null;
    },
  };
}
