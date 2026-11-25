import { and, eq, gt, sql } from "drizzle-orm";
import { anyOf, insertBatches, type Orm, ormOf, type Tx } from "../../../core/db";
import type { EmployeeAppChoice } from "../domain";
import { employeeAppChoices } from "./employeeAppChoicesTable";
import { employeeTemplates } from "./employeeTemplatesTable";
import { templateApps } from "./templateAppsTable";

/** Template assignments and exceptions, read in batches and changed in the caller's transaction. */
export interface AssignmentRepository {
  forEmployees(ids: readonly string[]): Promise<Assignment[]>;
  employeesWithAccessSources(): Promise<string[]>;
  employeeIds(templateId: string): Promise<string[]>;
  assign(assignment: Assignment, assignedBy: string): Promise<boolean>;
  takeOff(assignment: Assignment): Promise<boolean>;
  choicesFor(
    ids: readonly string[],
    appIds?: readonly string[],
    choice?: EmployeeAppChoice["choice"],
  ): Promise<EmployeeAppChoice[]>;
  listedApps(ids: readonly string[]): Promise<Set<string>>;
  sources(
    pairs: readonly EmployeeAppPair[],
  ): Promise<(EmployeeAppPair & { role: string | null })[]>;
  /** Replaces whatever choice the person had for the app. */
  saveChoice(choice: EmployeeAppChoice): Promise<void>;
  peoplePage(
    templateId: string,
    after: string | null,
    limit: number,
  ): Promise<{ id: string; employeeId: string }[]>;
  markForReview(pairs: EmployeeAppPair[]): Promise<EmployeeAppPair[]>;
  reviews(appIds: readonly string[]): Promise<EmployeeAppPair[]>;
  clearChoices(
    pairs: EmployeeAppPair[],
    choice: EmployeeAppChoice["choice"],
  ): Promise<EmployeeAppPair[]>;
  /** Deletes every assignment of the employee; returns the ids of the templates taken off. */
  takeOffAll(employeeId: string): Promise<string[]>;
  /** Deletes every app choice of the employee; returns the choices deleted. */
  clearChoicesOf(employeeId: string): Promise<EmployeeAppChoice[]>;
}

interface Assignment {
  employeeId: string;
  templateId: string;
}
export type EmployeeAppPair = Pick<EmployeeAppChoice, "employeeId" | "appId">;

export function assignmentRepository(db: Orm | Tx): AssignmentRepository {
  const orm = ormOf(db);
  const assignments = () =>
    orm
      .select({
        employeeId: employeeTemplates.employeeId,
        templateId: employeeTemplates.templateId,
      })
      .from(employeeTemplates);
  return {
    forEmployees: (ids) =>
      assignments().where(anyOf(employeeTemplates.employeeId, ids)).orderBy(employeeTemplates.id),
    async employeesWithAccessSources() {
      const rows = await orm
        .select({ employeeId: employeeTemplates.employeeId })
        .from(employeeTemplates)
        .union(orm.select({ employeeId: employeeAppChoices.employeeId }).from(employeeAppChoices));
      return rows.map(({ employeeId }) => employeeId);
    },
    employeeIds: async (templateId) =>
      (
        await orm
          .select({ id: employeeTemplates.employeeId })
          .from(employeeTemplates)
          .where(eq(employeeTemplates.templateId, templateId))
      ).map((row) => row.id),
    async assign(assignment, assignedBy) {
      const inserted = await orm
        .insert(employeeTemplates)
        .values({ ...assignment, assignedBy })
        .onConflictDoNothing()
        .returning({ id: employeeTemplates.id });
      return inserted.length > 0;
    },
    async takeOff({ employeeId, templateId }) {
      const removed = await orm
        .delete(employeeTemplates)
        .where(
          and(
            eq(employeeTemplates.employeeId, employeeId),
            eq(employeeTemplates.templateId, templateId),
          ),
        )
        .returning({ id: employeeTemplates.id });
      return removed.length > 0;
    },
    choicesFor: (ids, appIds, choice) =>
      orm
        .select()
        .from(employeeAppChoices)
        .where(
          and(
            anyOf(employeeAppChoices.employeeId, ids),
            choice && eq(employeeAppChoices.choice, choice),
            appIds && anyOf(employeeAppChoices.appId, appIds),
          ),
        ),
    async saveChoice(choice) {
      await orm
        .insert(employeeAppChoices)
        .values(choice)
        .onConflictDoUpdate({
          target: [PAIR.employeeId, PAIR.appId],
          set: { choice: choice.choice, role: choice.role },
        });
    },
    async listedApps(ids) {
      const listed = await orm
        .selectDistinct({ appId: templateApps.appId })
        .from(templateApps)
        .where(anyOf(templateApps.appId, ids));
      return new Set(listed.map(({ appId }) => appId));
    },
    sources: (pairs) =>
      orm
        .selectDistinct({
          employeeId: employeeTemplates.employeeId,
          appId: templateApps.appId,
          role: templateApps.role,
        })
        .from(employeeTemplates)
        .innerJoin(templateApps, eq(templateApps.templateId, employeeTemplates.templateId))
        .where(sql`(${employeeTemplates.employeeId},${templateApps.appId}) in ${pairList(pairs)}`),
    peoplePage: (templateId, after, limit) =>
      orm
        .select({ id: employeeTemplates.id, employeeId: employeeTemplates.employeeId })
        .from(employeeTemplates)
        .where(
          and(
            eq(employeeTemplates.templateId, templateId),
            after ? gt(employeeTemplates.id, after) : undefined,
          ),
        )
        .orderBy(employeeTemplates.id)
        .limit(limit),
    async markForReview(pairs) {
      const inserted: EmployeeAppPair[] = [];
      for (const batch of insertBatches(pairs)) {
        const rows = await orm
          .insert(employeeAppChoices)
          .values(batch.map((pair) => ({ ...pair, choice: "to_review" as const })))
          .onConflictDoNothing()
          .returning(PAIR);
        inserted.push(...rows);
      }
      return inserted;
    },
    reviews: (appIds) =>
      orm
        .select(PAIR)
        .from(employeeAppChoices)
        .where(
          and(eq(employeeAppChoices.choice, "to_review"), anyOf(employeeAppChoices.appId, appIds)),
        ),
    clearChoices: (pairs, choice) =>
      orm
        .delete(employeeAppChoices)
        .where(
          and(
            eq(employeeAppChoices.choice, choice),
            // Bind each column once; the two arrays pair up by position.
            sql`(${PAIR.employeeId},${PAIR.appId}) in ${pairList(pairs)}`,
          ),
        )
        .returning(PAIR),
    async takeOffAll(employeeId) {
      const rows = await orm
        .delete(employeeTemplates)
        .where(eq(employeeTemplates.employeeId, employeeId))
        .returning({ templateId: employeeTemplates.templateId });
      return rows.map(({ templateId }) => templateId);
    },
    clearChoicesOf: (employeeId) =>
      orm
        .delete(employeeAppChoices)
        .where(eq(employeeAppChoices.employeeId, employeeId))
        .returning(),
  };
}

function pairList(pairs: readonly EmployeeAppPair[]) {
  return sql`(select * from unnest(${sql.param(pairs.map((pair) => pair.employeeId))}::uuid[],${sql.param(pairs.map((pair) => pair.appId))}::uuid[]))`;
}

const PAIR = { employeeId: employeeAppChoices.employeeId, appId: employeeAppChoices.appId };
