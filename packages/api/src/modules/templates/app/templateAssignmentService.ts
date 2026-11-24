import { z } from "zod";
import { paginate, type PageArgs, type Connection } from "../../../core/pagination";
import { ApplicationError } from "../../../core/applicationError";
import type { Orm, Tx } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import { createRecordHistoryService, type HistoryAppend } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { assignmentRepository } from "../db";
import { appsOfPerson, type PersonApp, type Template } from "../domain";
import type { EmployeeById, PersonAccess } from "../ports";
import { employeeTemplatesOf } from "./employeeTemplates";
import { lockTemplate } from "./lockTemplate";
import { clearInactiveReviews, reviewLostApps } from "./reviewLostApps";

/** Changes to a person's templates and the reads that show what those templates give. */
export interface TemplateAssignmentService {
  /** Ends reviews whose account just stopped being active, inside the account change or scan. */
  clearInactiveReviews: (
    tx: Tx,
    appIds: readonly string[],
    provenance: Pick<HistoryAppend, "cause" | "requestedBy">,
  ) => Promise<void>;
  assign: (ctx: SecurityContext, input: AssignmentInput) => Promise<Template>;
  takeOff: (ctx: SecurityContext, input: AssignmentInput) => Promise<Template>;
  readEmployeeTemplates: (
    ctx: SecurityContext,
    employeeIds: readonly string[],
    db?: Orm,
  ) => Promise<Template[][]>;
  readTemplatePeople: (
    ctx: SecurityContext,
    id: string,
    args: PageArgs,
  ) => Promise<Connection<string>>;
  readEmployeeApps: (
    ctx: SecurityContext,
    employeeIds: readonly string[],
    shared?: {
      templates: Template[][];
      invites: Awaited<ReturnType<PersonAccess["readAppInvites"]>>;
    },
    db?: Orm,
  ) => Promise<PersonApp[][]>;
}

interface AssignmentInput {
  id: string;
  employeeId: string;
}
type Dependencies = Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  apps: PersonAccess;
  employees: EmployeeById;
};
const history = createRecordHistoryService();

export function createTemplateAssignmentService(deps: Dependencies): TemplateAssignmentService {
  const { orm, apps } = deps;
  return {
    clearInactiveReviews: (tx, appIds, provenance) =>
      clearInactiveReviews(tx, apps, appIds, provenance),
    assign: (ctx, input) => changeAssignment(deps, ctx, input, "assign"),
    takeOff: (ctx, input) => changeAssignment(deps, ctx, input, "takeOff"),
    readEmployeeTemplates(ctx, employeeIds, db = orm) {
      ctx.require("MANAGE_WORKSPACE");
      return employeeTemplatesOf(db, employeeIds);
    },
    async readTemplatePeople(ctx, id, args) {
      ctx.require("MANAGE_WORKSPACE");
      return paginate(args, {
        order: { field: "ASSIGNED", direction: "ASC" },
        keysetValues: { ASSIGNED: z.tuple([z.uuid()]) },
        fetch: async ({ after, limit }) =>
          (await assignmentRepository(orm).peoplePage(id, after?.[0] ?? null, limit)).map(
            (row) => ({ node: row.employeeId, values: [row.id] }),
          ),
      });
    },
    async readEmployeeApps(ctx, employeeIds, shared, db = orm) {
      ctx.require("MANAGE_WORKSPACE");
      const repo = assignmentRepository(db);
      const [templates, choices, accounts, invites] = await Promise.all([
        shared?.templates ?? employeeTemplatesOf(db, employeeIds),
        repo.choicesFor(employeeIds),
        apps.findEmployeeAccounts(db, employeeIds),
        shared?.invites ?? apps.readAppInvites(ctx, employeeIds),
      ]);
      const listedApps = await repo.listedApps(accounts.map((account) => account.appId));
      const choicesByPerson = Map.groupBy(choices, (choice) => choice.employeeId);
      const accountsByPerson = Map.groupBy(accounts, (account) => account.employeeId);
      const invitesByPerson = Map.groupBy(invites, (invite) => invite.employeeId);
      return employeeIds.map((id, index) =>
        appsOfPerson({
          templates: templates[index]!,
          choices: choicesByPerson.get(id) ?? [],
          accounts: accountsByPerson.get(id) ?? [],
          invites: invitesByPerson.get(id) ?? [],
          listedApps,
        }),
      );
    },
  };
}

async function changeAssignment(
  { apps, employees, transact, logger }: Dependencies,
  ctx: SecurityContext,
  input: AssignmentInput,
  action: "assign" | "takeOff",
) {
  ctx.require("MANAGE_WORKSPACE");
  if (!ctx.user?.isOwner)
    throw new ApplicationError("FORBIDDEN", "Only the owner can change a person's templates.");
  const assignedBy = ctx.user.userId;
  const employee = await employees.readEmployee(ctx, input.employeeId);
  if (!employee) throw new ApplicationError("NOT_FOUND", "No employee has this id.");
  const employeeId = employee.id;
  const { template, changed } = await transact(async (tx) => {
    const template = await lockTemplate(tx, input.id);
    const repo = assignmentRepository(tx);
    const assignment = { employeeId, templateId: template.id };
    if (action === "assign") await requireActiveEmployee(tx, apps, employees, employeeId);
    const changed =
      action === "assign"
        ? await repo.assign(assignment, assignedBy)
        : await repo.takeOff(assignment);
    if (!changed) return { template, changed };
    await recordAssignment(ctx, tx, employeeId, template, action);
    if (action === "takeOff")
      await reviewLostApps(
        ctx,
        tx,
        apps,
        employees,
        [employeeId],
        template.apps.map((app) => app.appId),
      );
    return {
      template: { ...template, peopleCount: template.peopleCount + (action === "assign" ? 1 : -1) },
      changed,
    };
  });
  if (changed)
    logger.info({ templateId: template.id, employeeId, action }, "Template assignment changed");
  return template;
}

async function recordAssignment(
  ctx: SecurityContext,
  tx: Tx,
  employeeId: string,
  template: Template,
  action: "assign" | "takeOff",
) {
  const change =
    action === "assign"
      ? { oldValue: null, newValue: template.id, newLabel: template.name }
      : { oldValue: template.id, oldLabel: template.name, newValue: null };
  await history.append(ctx, tx, {
    recordType: "employee",
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
    records: [{ recordId: employeeId, changes: [{ field: "template", ...change }] }],
  });
}

async function requireActiveEmployee(
  tx: Tx,
  apps: PersonAccess,
  employees: EmployeeById,
  employeeId: string,
) {
  await employees.holdForReference(tx, [employeeId]);
  if (!(await apps.activeInDirectory(tx, employeeId))) {
    throw new ApplicationError(
      "INVALID_INPUT",
      "Only a person active in the directory can be assigned a template.",
      [{ field: "employeeId", code: "invalid" }],
    );
  }
}
