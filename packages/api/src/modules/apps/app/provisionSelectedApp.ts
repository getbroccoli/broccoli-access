import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { SecurityContext } from "../../../core/security";
import type { Logger } from "../../../core/logger";
import { parseUuid } from "../../../utils";
import type { AccountChange } from "../domain";
import type { PersonPage } from "../ports";
import type { ProvisionService } from "./provisionService";

export interface AppProvisionResult {
  changes: AccountChange[];
  refusedEmployeeIds: string[];
}

/** Differences reports a refusal for missing access with no offered or running change. */
export function refuseUnavailableSelection(page: PersonPage, confirmed: PersonPage["personApps"]) {
  if (confirmed.some(({ appId, state }) => state === "missing" && !hasRunningStep(page, appId))) {
    throw new ApplicationError("CONFLICT", "This app cannot be provisioned for this person now.");
  }
}

function hasRunningStep(page: PersonPage, appId: string) {
  return (
    page.appInvites.some((row) => row.appId === appId && row.latestInvite?.status === "running") ||
    page.appAccounts.some((row) => {
      const change = row.changeState?.latestChange;
      return row.appId === appId && change?.action === "reactivate" && change.status === "running";
    })
  );
}

/** Keeps a person's refusal from preventing Provision for the others in the same request. */
export async function provisionSelectedApp(
  ctx: SecurityContext,
  { appId: inputApp, employeeIds }: { appId: string; employeeIds: readonly string[] },
  provisionEmployee: ProvisionService["provisionEmployee"],
  logger: Logger,
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
      if (error instanceof ApplicationError && error.code === "FORBIDDEN") throw error;
      if (!(error instanceof ApplicationError))
        logger.error(
          { appId, employeeId: parseUuid(employeeId) },
          "Provision failed for one employee",
        );
      result.refusedEmployeeIds.push(employeeId);
    }
  }
  return result;
}

/** The maximum directory size displayed by the People list. */
const MAX_PROVISION_PEOPLE = 10_000;
