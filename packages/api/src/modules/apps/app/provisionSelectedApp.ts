import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { SecurityContext } from "../../../core/security";
import { parseUuid } from "../../../utils";
import type { AccountChange } from "../domain";
import type { ProvisionService } from "./provisionService";

export interface AppProvisionResult {
  changes: AccountChange[];
  refusedEmployeeIds: string[];
}

/** Keeps a person's refusal from preventing Provision for the others in the same request. */
export async function provisionSelectedApp(
  ctx: SecurityContext,
  { appId: inputApp, employeeIds }: { appId: string; employeeIds: readonly string[] },
  provisionEmployee: ProvisionService["provisionEmployee"],
): Promise<AppProvisionResult> {
  ctx.require("MANAGE_WORKSPACE");
  if (!ctx.user)
    throw new ApplicationError("FORBIDDEN", "Only a signed-in user can provision access.");
  const appId = parseUuid(inputApp);
  if (!appId) throw invalidInput([{ field: "appId", code: "invalid" }]);
  if (!employeeIds.length || employeeIds.length > MAX_PROVISION_PEOPLE)
    throw invalidInput([{ field: "employeeIds", code: "out_of_range" }]);
  const result: AppProvisionResult = { changes: [], refusedEmployeeIds: [] };
  for (const employeeId of new Set(employeeIds.map((id) => parseUuid(id) ?? id))) {
    try {
      const changes = await provisionEmployee(ctx, { employeeId, appIds: [appId] });
      result.changes.push(...changes);
    } catch (error) {
      if (!(error instanceof ApplicationError) || !["CONFLICT", "NOT_FOUND"].includes(error.code))
        throw error;
      result.refusedEmployeeIds.push(employeeId);
    }
  }
  return result;
}

/** The maximum directory size displayed by the People list. */
const MAX_PROVISION_PEOPLE = 10_000;
