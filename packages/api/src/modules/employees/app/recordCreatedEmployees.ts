import type { Tx } from "../../../core/db";
import { createRecordHistoryService, type HistoryAppend } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { type Employee, employeeChanges } from "../domain";

const recordHistory = createRecordHistoryService();

/** Records the new employees in their history, joining `tx`. */
export async function recordCreatedEmployees(
  ctx: SecurityContext,
  tx: Tx,
  employees: readonly Employee[],
  cause: HistoryAppend["cause"],
): Promise<void> {
  await recordHistory.append(ctx, tx, {
    recordType: "employee",
    operation: "CREATED",
    cause,
    records: employees.map((employee) => ({
      recordId: employee.id,
      changes: employeeChanges(null, employee),
    })),
  });
}
