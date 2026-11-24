import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import { createRecordHistoryService } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { parseUuid } from "../../../utils";
import { assignmentRepository, type EmployeeAppPair, templateRepository } from "../db";
import { personAppRole, type Template } from "../domain";
import type { AppsById, EmployeeById, PersonAccess } from "../ports";
import { lockTemplate } from "./lockTemplate";

const history = createRecordHistoryService();

export interface TemplateRoles {
  setAppRole(
    ctx: SecurityContext,
    input: { id: string; appId: string; role: string | null },
  ): Promise<Template>;
  pickRole(ctx: SecurityContext, input: EmployeeAppPair & { role: string | null }): Promise<void>;
}

type Dependencies = Pick<ModuleDependencies, "transact" | "logger"> & {
  apps: AppsById & PersonAccess;
  employees: EmployeeById;
};

export function createTemplateRoles({
  apps,
  employees,
  transact,
  logger,
}: Dependencies): TemplateRoles {
  return {
    async setAppRole(ctx, { id, appId, role: requested }) {
      ctx.require("MANAGE_WORKSPACE");
      const role = await checkedRole(ctx, apps, appId, requested);
      const { template, changed } = await transact(async (tx) => {
        const template = await lockTemplate(tx, id);
        const member = template.apps.find((app) => app.appId === appId);
        if (!member) throw invalidInput([{ field: "appId", code: "invalid" }]);
        if (member.role === role) return { template, changed: false };
        const people = await assignmentRepository(tx).employeeIds(template.id);
        await employees.holdForReference(tx, people);
        const [app] = await apps.lockAppsForReview(tx, [appId]);
        await templateRepository(tx).setAppRole(member.id, role);
        await clearStaleRolePicks(ctx, tx, people, [appId]);
        await history.append(ctx, tx, {
          recordType: "template",
          operation: "UPDATED",
          cause: { kind: "EDITED_DIRECTLY" },
          records: [
            {
              recordId: id,
              changes: [
                {
                  field: "appRole",
                  oldValue: member.role,
                  newValue: role,
                  oldLabel: app!.name + " — " + (member.role ?? "default"),
                  newLabel: app!.name + " — " + (role ?? "default"),
                },
              ],
            },
          ],
        });
        member.role = role;
        return { template, changed: true };
      });
      if (changed) logger.info({ templateId: id, appId }, "Template app role changed");
      return template;
    },
    async pickRole(ctx, { employeeId, appId, role: requested }) {
      ctx.require("MANAGE_WORKSPACE");
      if (!ctx.user?.isOwner)
        throw new ApplicationError("FORBIDDEN", "Only the owner can pick a person's role.");
      if (!(await employees.readEmployee(ctx, employeeId)))
        throw new ApplicationError("NOT_FOUND", "No employee has this id.");
      const role = await checkedRole(ctx, apps, appId, requested);
      await transact(async (tx) => {
        await employees.holdForReference(tx, [employeeId]);
        await apps.lockAppsForReview(tx, [appId]);
        const { roles, choice } = await roleFacts(tx, employeeId, appId);
        if (!personAppRole(roles, choice).roleConflict)
          throw new ApplicationError("CONFLICT", "This app has no role conflict.");
        if (!roles.has(role)) throw invalidInput([{ field: "role", code: "invalid" }]);
        const pair = { employeeId, appId };
        await assignmentRepository(tx).saveRolePick(pair, role);
        await recordRolePicks(ctx, tx, [{ ...pair, role }], "picked");
      });
      logger.info({ employeeId, appId }, "Employee app role picked");
    },
  };
}

/** The invite transaction holds the app's review lock while it reads and queues this role. */
export async function readInviteRole(tx: Tx, employeeId: string, appId: string) {
  const { roles, choice } = await roleFacts(tx, employeeId, appId);
  const { role, roleConflict } = personAppRole(roles, choice);
  if (roleConflict)
    throw new ApplicationError("CONFLICT", "Pick a role before inviting this person.");
  return role;
}

/** Called with the affected apps locked, before a lost app can be marked for review. */
export async function clearStaleRolePicks(
  ctx: SecurityContext,
  tx: Tx,
  employeeIds: string[],
  appIds: string[],
) {
  const repo = assignmentRepository(tx);
  const picks = (await repo.choicesFor(employeeIds, appIds)).filter(
    ({ choice }) => choice === "role_picked",
  );
  if (!picks.length) return;
  const sources = Map.groupBy(await repo.sources(employeeIds, appIds), pairKey);
  const stale = picks.filter((pick) => {
    const roles = new Set(sources.get(pairKey(pick))?.map(({ role }) => role));
    return roles.size < 2 || !roles.has(pick.role);
  });
  if (!stale.length) return;
  await repo.clearChoices(stale, "role_picked");
  await recordRolePicks(ctx, tx, stale, "cleared");
}

function pairKey({ employeeId, appId }: EmployeeAppPair) {
  return employeeId + "/" + appId;
}

async function roleFacts(tx: Tx, employeeId: string, appId: string) {
  const repo = assignmentRepository(tx);
  const sources = await repo.sources([employeeId], [appId]);
  const [choice] = await repo.choicesFor([employeeId], [appId]);
  return { roles: new Set(sources.map(({ role }) => role)), choice };
}

async function checkedRole(
  ctx: SecurityContext,
  apps: AppsById,
  appId: string,
  role: string | null,
) {
  if (!parseUuid(appId)) throw invalidInput([{ field: "appId", code: "invalid" }]);
  if (role === null) return null;
  const listed = (await apps.readAppRoles(ctx, [appId]))
    .get(appId)
    ?.find(({ key }) => key === role);
  if (!listed) throw invalidInput([{ field: "role", code: "invalid" }]);
  return listed.isDefault ? null : listed.key;
}

async function recordRolePicks(
  ctx: SecurityContext,
  tx: Tx,
  picks: (EmployeeAppPair & { role: string | null })[],
  action: "picked" | "cleared",
) {
  await history.append(ctx, tx, {
    recordType: "employee",
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
    records: [...Map.groupBy(picks, (pick) => pick.employeeId)].map(([recordId, choices]) => ({
      recordId,
      changes: choices.map(({ appId, role }) => ({
        field: "appChoice",
        oldValue: action === "cleared" ? appId : null,
        newValue: action === "picked" ? appId : null,
        oldLabel: action === "cleared" ? (role ?? "default") : null,
        newLabel: action === "picked" ? (role ?? "default") : null,
      })),
    })),
  });
}
