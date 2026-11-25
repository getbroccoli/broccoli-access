import type { Tx } from "../../../core/db";
import { createRecordHistoryService } from "../../../core/records";
import { PrincipalSecurityContext } from "../../../core/security";
import { assignmentRepository } from "../db";
import type { PersonAccess } from "../ports";
import { employeeTemplatesOf } from "./employeeTemplates";

const history = createRecordHistoryService();

/**
 * Offboarding takes every template off the person and deletes their app choices, with one history
 * line by the user who asked, joining the offboarding's transaction. Nothing is marked for review:
 * the same offboarding disables the accounts.
 */
export async function clearOffboarded(
  tx: Tx,
  apps: Pick<PersonAccess, "lockAppsForReview">,
  { employeeId, requestedBy }: { employeeId: string; requestedBy: string },
): Promise<void> {
  const repo = assignmentRepository(tx);
  const [assigned] = await employeeTemplatesOf(tx, [employeeId]);
  // In the order the other template changes take, so none deadlocks with this: the assignment
  // rows first, as Take off does, then the app review locks, then the choices, as a role edit does.
  const takenOff = new Set(await repo.takeOffAll(employeeId));
  // Only what this delete took off: a Take off that committed first recorded its own.
  const templates = assigned!.filter(({ id }) => takenOff.has(id));
  const kept = await repo.choicesFor([employeeId]);
  const lockedApps = await apps.lockAppsForReview(tx, [
    ...new Set([
      ...kept.map(({ appId }) => appId),
      ...templates.flatMap((template) => template.apps.map(({ appId }) => appId)),
    ]),
  ]);
  const choices = await repo.clearChoicesOf(employeeId);
  if (!templates.length && !choices.length) {
    return;
  }
  const appNames = new Map(lockedApps.map(({ id, name }) => [id, name]));
  await history.append(PrincipalSecurityContext.system(), tx, {
    recordType: "employee",
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
    requestedBy,
    records: [
      {
        recordId: employeeId,
        changes: [
          ...templates.map(({ id, name }) => ({
            field: "template",
            oldValue: id,
            oldLabel: name,
            newValue: null,
          })),
          ...choices.map(({ appId, choice }) => ({
            field: "appChoice",
            oldValue: appId,
            oldLabel: `${appNames.get(appId)} — ${choice.replaceAll("_", " ")}`,
            newValue: null,
          })),
        ],
      },
    ],
  });
}
