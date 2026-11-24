import { and, count, eq, notExists, sql } from "drizzle-orm";
import { z } from "zod";

import {
  afterKeyset,
  anyOf,
  isUniqueViolation,
  keysetOrder,
  type Orm,
  orderByKeyset,
  ormOf,
  type Tx,
} from "../../../core/db";
import type { KeysetQuery, KeysetRow } from "../../../core/pagination";
import { type Template, type TemplateApp, TemplateNameTakenError } from "../domain";
import { employeeTemplates } from "./employeeTemplatesTable";
import { templateApps } from "./templateAppsTable";
import { templates } from "./templatesTable";

/** Templates in Postgres, through the pool or inside a transaction. */
export interface TemplateRepository {
  /** Stores a template without apps; throws `TemplateNameTakenError` for a taken name. */
  insert(name: string): Promise<Template>;
  /** Renames the template; throws `TemplateNameTakenError` for a taken name. */
  rename(id: string, name: string): Promise<void>;
  /** Deletes the template with its apps and its assignments. */
  delete(id: string): Promise<void>;
  /** The templates with these ids, with their apps and people; an unknown id is left out. */
  findByIds(ids: readonly string[]): Promise<Template[]>;
  /** Like `findByIds` for one template, locking its row until the transaction ends. */
  lockById(id: string): Promise<Template | null>;
  /** One page of the templates, by name ignoring case. */
  findPage(
    query: TemplatePageQuery,
    assignableTo?: string | null,
  ): Promise<KeysetRow<Template, unknown[]>[]>;
  /** Adds the app to the template, which must not list it yet. */
  insertApp(templateId: string, appId: string): Promise<TemplateApp>;
  deleteApp(templateId: string, appId: string): Promise<void>;
}

/** The template list's one order: its sort values are the lowercased name and the id. */
export const TEMPLATE_SORT_VALUES: Record<"NAME", z.ZodType<unknown[]>> = {
  // Postgres text cannot hold NUL, so a cursor with one is no cursor this API issued.
  NAME: z.tuple([z.string().refine((name) => !name.includes("\0")), z.uuid()]),
};

export type TemplatePageQuery = KeysetQuery<keyof typeof TEMPLATE_SORT_VALUES, unknown[]>;

export function templateRepository(db: Orm | Tx): TemplateRepository {
  const orm = () => ormOf(db);
  const withAppsAndPeople = (rows: readonly StoredTemplate[]) => readAppsAndPeople(orm(), rows);
  return {
    insert: async (name) => {
      try {
        const [template] = await orm().insert(templates).values({ name }).returning();
        return { ...template!, apps: [], peopleCount: 0 };
      } catch (error) {
        throw nameTakenOr(error);
      }
    },
    rename: async (id, name) => {
      try {
        await orm().update(templates).set({ name }).where(eq(templates.id, id));
      } catch (error) {
        throw nameTakenOr(error);
      }
    },
    delete: async (id) => {
      await orm().delete(templates).where(eq(templates.id, id));
    },
    findByIds: async (ids) =>
      withAppsAndPeople(await orm().select().from(templates).where(anyOf(templates.id, ids))),
    lockById: async (id) => {
      const rows = await orm().select().from(templates).where(eq(templates.id, id)).for("update");
      const [template] = await withAppsAndPeople(rows);
      return template ?? null;
    },
    findPage: async ({ after, limit }, assignableTo) => {
      const rows = await orm()
        .select({ template: templates, name: LOWERCASE_NAME })
        .from(templates)
        .where(
          and(
            after ? afterKeyset(PAGE_ORDER, after) : undefined,
            assignableTo
              ? notExists(
                  orm()
                    .select({ id: employeeTemplates.id })
                    .from(employeeTemplates)
                    .where(
                      and(
                        eq(employeeTemplates.templateId, templates.id),
                        eq(employeeTemplates.employeeId, assignableTo),
                      ),
                    ),
                )
              : undefined,
          ),
        )
        .orderBy(...orderByKeyset(PAGE_ORDER))
        .limit(limit);
      const page = await withAppsAndPeople(rows.map(({ template }) => template));
      return page.map((node, index) => ({ node, values: [rows[index]!.name, node.id] }));
    },
    insertApp: async (templateId, appId) => {
      const [app] = await orm()
        .insert(templateApps)
        .values({ templateId, appId })
        .returning({ id: templateApps.id, appId: templateApps.appId });
      return app!;
    },
    deleteApp: async (templateId, appId) => {
      await orm()
        .delete(templateApps)
        .where(and(eq(templateApps.templateId, templateId), eq(templateApps.appId, appId)));
    },
  };
}

type StoredTemplate = typeof templates.$inferSelect;

const NAME_UNIQUE_INDEX = "templates_name_unique";

const LOWERCASE_NAME = sql<string>`lower(${templates.name})`;

const PAGE_ORDER = keysetOrder(
  [{ expression: LOWERCASE_NAME, descending: false }],
  sql`${templates.id}`,
  false,
);

function nameTakenOr(error: unknown): unknown {
  return isUniqueViolation(error, NAME_UNIQUE_INDEX) ? new TemplateNameTakenError() : error;
}

/** The templates in the order given, each with its apps in the order added and its people count. */
async function readAppsAndPeople(orm: Orm, rows: readonly StoredTemplate[]): Promise<Template[]> {
  const ids = rows.map(({ id }) => id);
  const apps = await orm
    .select()
    .from(templateApps)
    .where(anyOf(templateApps.templateId, ids))
    // Ids are UUIDv7, so they sort in the order the apps were added.
    .orderBy(templateApps.id);
  const people = await orm
    .select({ templateId: employeeTemplates.templateId, people: count() })
    .from(employeeTemplates)
    .where(anyOf(employeeTemplates.templateId, ids))
    .groupBy(employeeTemplates.templateId);
  const appsByTemplate = Map.groupBy(apps, ({ templateId }) => templateId);
  const peopleByTemplate = new Map(people.map((row) => [row.templateId, row.people]));
  return rows.map((template) => ({
    ...template,
    apps: (appsByTemplate.get(template.id) ?? []).map(({ id, appId }): TemplateApp => ({
      id,
      appId,
    })),
    peopleCount: peopleByTemplate.get(template.id) ?? 0,
  }));
}
