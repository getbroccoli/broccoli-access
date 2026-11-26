import { invalidInput } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import type { ModuleDependencies } from "../../../core/moduleManifest";
import { type Connection, type PageArgs, paginate } from "../../../core/pagination";
import { createRecordHistoryService, type FieldChange } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { parseUuid } from "../../../utils";
import { assignmentRepository, TEMPLATE_SORT_VALUES, templateRepository } from "../db";
import { parseTemplateName, type Template, TemplateNameTakenError } from "../domain";
import type { AppsById, EmployeeById, PersonAccess } from "../ports";
import {
  createTemplateAssignmentService,
  type TemplateAssignmentService,
} from "./templateAssignmentService";
import { createPersonAppChoices, type PersonAppChoices } from "./personAppChoices";
import { createTemplateRoles, type TemplateRoles } from "./templateRoles";
import { lockTemplate } from "./lockTemplate";
import { type AccessDifferences, readDifferences } from "./readDifferences";
import { reviewLostApps } from "./reviewLostApps";

const recordHistory = createRecordHistoryService();

/**
 * Templates, the named lists of apps the owner assigns to people: each change in one transaction
 * with its history line. Every operation needs MANAGE_WORKSPACE.
 */
export interface TemplateService
  extends TemplateAssignmentService, TemplateRoles, PersonAppChoices {
  /** The templates, by name ignoring case. */
  listTemplates: (
    ctx: SecurityContext,
    args: PageArgs & { assignableTo?: string | null },
  ) => Promise<Connection<Template>>;
  /** The template; null for an unknown or malformed id. */
  readTemplate: (ctx: SecurityContext, templateId: string) => Promise<Template | null>;
  /** Missing and extra apps and the templates assigned to the people with differences. */
  readDifferences: (ctx: SecurityContext) => Promise<AccessDifferences>;
  /** Adds a template without apps; refuses a blank, too long or taken name as invalid `name`. */
  createTemplate: (ctx: SecurityContext, input: { name: string }) => Promise<Template>;
  /**
   * Renames the template; a name left out, or the name it has, changes nothing. Refuses an unknown
   * id with NOT_FOUND, and a blank, null, too long or taken name as invalid `name`.
   */
  updateTemplate: (
    ctx: SecurityContext,
    input: { id: string; name?: string | null },
  ) => Promise<Template>;
  /** Deletes the template with its apps and its assignments; refuses an unknown id with NOT_FOUND. */
  deleteTemplate: (ctx: SecurityContext, templateId: string) => Promise<void>;
  /**
   * Adds an approved app to the template; an app already in it changes nothing. Refuses an unknown
   * template with NOT_FOUND, and an app that is unknown, not approved or the directory's as invalid
   * `appId`: every person already has the directory's.
   */
  addApp: (ctx: SecurityContext, input: TemplateAppInput) => Promise<Template>;
  /**
   * Takes the app out of the template; an app that is not in it changes nothing. Refuses an unknown
   * template with NOT_FOUND.
   */
  takeOutApp: (ctx: SecurityContext, input: TemplateAppInput) => Promise<Template>;
}

/** A template and an app to add to it or take out of it. */
interface TemplateAppInput {
  /** The template's id. */
  id: string;
  appId: string;
}

type TemplateDependencies = Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
  /** The apps module, which knows each app's name and whether the company uses it. */
  apps: AppsById & PersonAccess;
  employees: EmployeeById;
};

export function createTemplateService({
  orm,
  transact,
  logger,
  apps,
  employees,
}: TemplateDependencies): TemplateService {
  return {
    ...createTemplateRoles({ transact, logger, apps, employees }),
    ...createPersonAppChoices({ transact, logger, apps, employees }),
    ...createTemplateAssignmentService({ orm, transact, logger, apps, employees }),
    readDifferences: async (ctx) => readDifferences(orm, apps, ctx),
    async listTemplates(ctx, { assignableTo, ...pageArgs }) {
      ctx.require("MANAGE_WORKSPACE");
      if (assignableTo != null && !parseUuid(assignableTo))
        throw invalidInput([{ field: "assignableTo", code: "invalid" }]);
      return paginate(pageArgs, {
        order: { field: "NAME", direction: "ASC" },
        keysetValues: TEMPLATE_SORT_VALUES,
        fetch: (query) => templateRepository(orm).findPage(query, assignableTo),
      });
    },
    async readTemplate(ctx, templateId) {
      ctx.require("MANAGE_WORKSPACE");
      const id = parseUuid(templateId);
      const [template] = id ? await templateRepository(orm).findByIds([id]) : [];
      return template ?? null;
    },
    async createTemplate(ctx, input) {
      ctx.require("MANAGE_WORKSPACE");
      const name = parseTemplateName(input.name);
      const template = await transact(async (tx) => {
        const created = await templateRepository(tx).insert(name).catch(refuseTakenName);
        await appendHistory(ctx, tx, {
          templateId: created.id,
          operation: "CREATED",
          change: nameChange(null, name),
        });
        return created;
      });
      logger.info({ templateId: template.id }, "Template created");
      return template;
    },
    async updateTemplate(ctx, { id, name: newName }) {
      ctx.require("MANAGE_WORKSPACE");
      const name = newName === undefined ? undefined : parseTemplateName(newName);
      const { template, renamed } = await transact(async (tx) => {
        const before = await lockTemplate(tx, id);
        if (name === undefined || name === before.name) {
          return { template: before, renamed: false };
        }
        await templateRepository(tx).rename(before.id, name).catch(refuseTakenName);
        await appendHistory(ctx, tx, {
          templateId: before.id,
          operation: "UPDATED",
          change: nameChange(before.name, name),
        });
        return { template: { ...before, name }, renamed: true };
      });
      if (renamed) {
        logger.info({ templateId: template.id }, "Template renamed");
      }
      return template;
    },
    async deleteTemplate(ctx, templateId) {
      ctx.require("MANAGE_WORKSPACE");
      const deleted = await transact(async (tx) => {
        const template = await lockTemplate(tx, templateId);
        await removeSources(
          ctx,
          tx,
          template,
          template.apps.map((row) => row.appId),
          () => templateRepository(tx).delete(template.id),
          apps,
          employees,
        );
        await appendHistory(ctx, tx, {
          templateId: template.id,
          operation: "DELETED",
          change: nameChange(template.name, null),
        });
        return template;
      });
      logger.info({ templateId: deleted.id }, "Template deleted");
    },
    async addApp(ctx, { id, appId }) {
      ctx.require("MANAGE_WORKSPACE");
      // Read before the transaction, which then holds its lock for its own writes only.
      const app = await readApp(apps, ctx, appId);
      const isApproved = app?.status === "approved";
      const { template, changed } = await transact(async (tx) => {
        const before = await lockTemplate(tx, id);
        if (before.apps.some((member) => member.appId === app?.id)) {
          return { template: before, changed: false };
        }
        if (!app || !isApproved || app.id === (await apps.directoryAppId(tx))) {
          throw invalidInput([{ field: "appId", code: "invalid" }]);
        }
        await apps.lockAppsForReview(tx, [app.id]);
        const member = await templateRepository(tx).insertApp(before.id, app.id);
        const added = { field: "app", oldValue: null, newValue: app.id, newLabel: app.name };
        await appendHistory(ctx, tx, {
          templateId: before.id,
          operation: "UPDATED",
          change: added,
        });
        return { template: { ...before, apps: [...before.apps, member] }, changed: true };
      });
      if (changed) {
        logger.info({ templateId: template.id, appId: app?.id }, "App added to a template");
      }
      return template;
    },
    async takeOutApp(ctx, { id, appId }) {
      ctx.require("MANAGE_WORKSPACE");
      const app = await readApp(apps, ctx, appId);
      const { template, changed } = await transact(async (tx) => {
        const before = await lockTemplate(tx, id);
        const member = before.apps.find((templateApp) => templateApp.appId === app?.id);
        if (!app || !member) {
          return { template: before, changed: false };
        }
        await removeSources(
          ctx,
          tx,
          before,
          [app.id],
          () => templateRepository(tx).deleteApp(before.id, app.id),
          apps,
          employees,
        );
        await appendHistory(ctx, tx, {
          templateId: before.id,
          operation: "UPDATED",
          change: { field: "app", oldValue: app.id, oldLabel: app.name, newValue: null },
        });
        const remaining = before.apps.filter(({ id }) => id !== member.id);
        return { template: { ...before, apps: remaining }, changed: true };
      });
      if (changed) {
        logger.info({ templateId: template.id, appId: app?.id }, "App taken out of a template");
      }
      return template;
    },
  };
}

/** The app with its name and status; null for an unknown or malformed id. */
async function readApp(apps: AppsById, ctx: SecurityContext, appId: string) {
  const id = parseUuid(appId);
  const [app] = id ? await apps.readApps(ctx, [id]) : [];
  return app ?? null;
}

function refuseTakenName(error: unknown): never {
  if (error instanceof TemplateNameTakenError) {
    throw invalidInput([{ field: "name", code: "taken" }]);
  }
  throw error;
}

function nameChange(oldValue: string | null, newValue: string | null): FieldChange {
  return { field: "name", oldValue, newValue };
}

/** One history line on the template, made directly by the caller. */
async function appendHistory(
  ctx: SecurityContext,
  tx: Tx,
  {
    templateId,
    operation,
    change,
  }: { templateId: string; operation: "CREATED" | "UPDATED" | "DELETED"; change: FieldChange },
): Promise<void> {
  await recordHistory.append(ctx, tx, {
    recordType: "template",
    operation,
    cause: { kind: "EDITED_DIRECTLY" },
    records: [{ recordId: templateId, changes: [change] }],
  });
}

/** A template deletion cascades its assignments, so capture its people before removing either source. */
async function removeSources(
  ctx: SecurityContext,
  tx: Tx,
  template: Template,
  appIds: string[],
  remove: () => Promise<void>,
  apps: PersonAccess,
  employees: EmployeeById,
) {
  const people = await assignmentRepository(tx).employeeIds(template.id);
  await remove();
  await reviewLostApps(ctx, tx, apps, employees, people, appIds);
}
