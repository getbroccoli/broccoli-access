import { ApplicationError, invalidInput } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import { createRecordHistoryService } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { assignmentRepository, type EmployeeAppPair } from "../db";
import type { EmployeeAppChoice } from "../domain";
import type { AppsById, EmployeeById, PersonAccess } from "../ports";
import { reviewLostApps } from "./reviewLostApps";
import { checkedAppId, checkedRole } from "./templateRoles";

/**
 * The owner's changes to one person's apps, apart from their templates, which stay as they are.
 * Each returns the employee's id and writes a history line on the employee. Owner only.
 */
export interface PersonAppChoices {
  /**
   * Gives the person an approved app that none of their templates gives; the same choice again
   * changes nothing. Refuses an app a template gives with CONFLICT, an unapproved app or an
   * unlisted role as invalid input, and a person who is not active in the directory.
   */
  addPersonApp: (
    ctx: SecurityContext,
    input: EmployeeAppPair & { role?: string | null },
  ) => Promise<string>;
  /** Keeps an app their templates give from the person; refuses any other app with CONFLICT. */
  removePersonApp: (ctx: SecurityContext, input: EmployeeAppPair) => Promise<string>;
  /**
   * Deletes the person's addition or removal of the app; without one, changes nothing. An active
   * account in an app that is then no longer theirs is marked for review.
   */
  undoPersonAppChoice: (ctx: SecurityContext, input: EmployeeAppPair) => Promise<string>;
}

type Dependencies = Pick<ModuleDependencies, "transact" | "logger"> & {
  apps: AppsById & PersonAccess;
  employees: EmployeeById;
};

const history = createRecordHistoryService();

export function createPersonAppChoices(deps: Dependencies): PersonAppChoices {
  const { apps, employees, transact, logger } = deps;
  return {
    async addPersonApp(ctx, input) {
      const pair = await ownersPair(deps, ctx, input);
      const [app] = await apps.readApps(ctx, [pair.appId]);
      if (app?.status !== "approved") throw invalidInput([{ field: "appId", code: "invalid" }]);
      const role = await checkedRole(ctx, apps, pair.appId, input.role ?? null);
      const changed = await transact(async (tx) => {
        const { given, choice, appName } = await lockedFacts(deps, tx, pair);
        if (!(await apps.activeInDirectory(tx, pair.employeeId)))
          throw new ApplicationError(
            "INVALID_INPUT",
            "Only a person active in the directory can be given an app.",
            [{ field: "employeeId", code: "invalid" }],
          );
        if (given)
          throw new ApplicationError("CONFLICT", "A template already gives this person the app.");
        const before = choice?.choice === "added" ? choice : undefined;
        if (before?.role === role) return false;
        await assignmentRepository(tx).saveChoice({ ...pair, choice: "added", role });
        await recordChoice(ctx, tx, pair, {
          oldLabel: before && choiceLabel(appName, before),
          newLabel: choiceLabel(appName, { choice: "added", role }),
        });
        return true;
      });
      if (changed) logger.info(pair, "App added for one employee");
      return pair.employeeId;
    },
    async removePersonApp(ctx, input) {
      const pair = await ownersPair(deps, ctx, input);
      const changed = await transact(async (tx) => {
        const { given, choice, appName } = await lockedFacts(deps, tx, pair);
        if (!given)
          throw new ApplicationError("CONFLICT", "No template gives this person the app.");
        if (choice?.choice === "removed") return false;
        await assignmentRepository(tx).saveChoice({ ...pair, choice: "removed", role: null });
        await recordChoice(ctx, tx, pair, {
          newLabel: choiceLabel(appName, { choice: "removed", role: null }),
        });
        return true;
      });
      if (changed) logger.info(pair, "App removed for one employee");
      return pair.employeeId;
    },
    async undoPersonAppChoice(ctx, input) {
      const pair = await ownersPair(deps, ctx, input);
      const changed = await transact(async (tx) => {
        const { choice, appName } = await lockedFacts(deps, tx, pair);
        if (!isOwnChoice(choice)) return false;
        await assignmentRepository(tx).clearChoices([pair], choice.choice);
        await recordChoice(ctx, tx, pair, { oldLabel: choiceLabel(appName, choice) });
        // Without the addition, an active account in the app may be one that nothing gives.
        await reviewLostApps(ctx, tx, apps, employees, [pair.employeeId], [pair.appId]);
        return true;
      });
      if (changed) logger.info(pair, "Employee app choice undone");
      return pair.employeeId;
    },
  };
}

/** The stored ids of the pair, once the caller is the owner and the employee exists. */
async function ownersPair(
  { employees }: Dependencies,
  ctx: SecurityContext,
  input: EmployeeAppPair,
): Promise<EmployeeAppPair> {
  ctx.require("MANAGE_WORKSPACE");
  if (!ctx.user?.isOwner)
    throw new ApplicationError("FORBIDDEN", "Only the owner can change a person's apps.");
  const employee = await employees.readEmployee(ctx, input.employeeId);
  if (!employee) throw new ApplicationError("NOT_FOUND", "No employee has this id.");
  return { employeeId: employee.id, appId: checkedAppId(input.appId) };
}

/** Holds the person and the app, as every change to their sources does, then reads what decides. */
async function lockedFacts({ apps, employees }: Dependencies, tx: Tx, pair: EmployeeAppPair) {
  await employees.holdForReference(tx, [pair.employeeId]);
  const [app] = await apps.lockAppsForReview(tx, [pair.appId]);
  const repo = assignmentRepository(tx);
  const sources = await repo.sources([pair]);
  const [choice] = await repo.choicesFor([pair.employeeId], [pair.appId]);
  return { given: sources.length > 0, choice, appName: app?.name };
}

function isOwnChoice(
  choice?: EmployeeAppChoice,
): choice is EmployeeAppChoice & { choice: "added" | "removed" } {
  return choice?.choice === "added" || choice?.choice === "removed";
}

function choiceLabel(
  appName: string | undefined,
  { choice, role }: Pick<EmployeeAppChoice, "choice" | "role">,
) {
  return `${appName} — ${choice}` + (role ? ` as ${role}` : "");
}

/** A new label records a choice made, an old one a choice undone, and both a changed choice. */
async function recordChoice(
  ctx: SecurityContext,
  tx: Tx,
  { employeeId, appId }: EmployeeAppPair,
  { oldLabel, newLabel }: { oldLabel?: string; newLabel?: string },
) {
  const change = {
    oldValue: oldLabel ? appId : null,
    oldLabel: oldLabel ?? null,
    newValue: newLabel ? appId : null,
    newLabel: newLabel ?? null,
  };
  await history.append(ctx, tx, {
    recordType: "employee",
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
    records: [{ recordId: employeeId, changes: [{ field: "appChoice", ...change }] }],
  });
}
