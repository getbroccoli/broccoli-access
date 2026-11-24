import { and, eq, gt, sql } from "drizzle-orm";
import { anyOf, insertBatches, type Orm, ormOf, type Tx } from "../../../core/db";
import type { EmployeeAppChoice } from "../domain";
import { employeeAppChoices } from "./employeeAppChoicesTable";
import { employeeTemplates } from "./employeeTemplatesTable";
import { templateApps } from "./templateAppsTable";

/** Template assignments and exceptions, read in batches and changed in the caller's transaction. */
export interface AssignmentRepository {
  forEmployees(ids: readonly string[]): Promise<Assignment[]>;
  employeeIds(templateId: string): Promise<string[]>;
  assign(assignment: Assignment, assignedBy: string): Promise<boolean>;
  takeOff(assignment: Assignment): Promise<boolean>;
  choicesFor(ids: readonly string[], appIds?: readonly string[]): Promise<EmployeeAppChoice[]>;
  listedApps(ids: readonly string[]): Promise<Set<string>>;
  sources(
    employeeIds: readonly string[],
    appIds: readonly string[],
  ): Promise<(EmployeeAppPair & { role: string | null })[]>;
  saveRolePick(pair: EmployeeAppPair, role: string | null): Promise<void>;
  peoplePage(
    templateId: string,
    after: string | null,
    limit: number,
  ): Promise<{ id: string; employeeId: string }[]>;
  markForReview(pairs: EmployeeAppPair[]): Promise<EmployeeAppPair[]>;
  reviews(appIds: readonly string[]): Promise<EmployeeAppPair[]>;
  clearChoices(
    pairs: EmployeeAppPair[],
    choice: "role_picked" | "to_review",
  ): Promise<EmployeeAppPair[]>;
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
    choicesFor: (ids, appIds) =>
      orm
        .select()
        .from(employeeAppChoices)
        .where(
          and(
            anyOf(employeeAppChoices.employeeId, ids),
            appIds && anyOf(employeeAppChoices.appId, appIds),
          ),
        ),
    async saveRolePick(pair, role) {
      await orm
        .insert(employeeAppChoices)
        .values({ ...pair, choice: "role_picked", role })
        .onConflictDoUpdate({
          target: [PAIR.employeeId, PAIR.appId],
          set: { choice: "role_picked", role },
        });
    },
    async listedApps(ids) {
      const listed = await orm
        .selectDistinct({ appId: templateApps.appId })
        .from(templateApps)
        .where(anyOf(templateApps.appId, ids));
      return new Set(listed.map(({ appId }) => appId));
    },
    sources: (employeeIds, appIds) =>
      orm
        .selectDistinct({
          employeeId: employeeTemplates.employeeId,
          appId: templateApps.appId,
          role: templateApps.role,
        })
        .from(employeeTemplates)
        .innerJoin(templateApps, eq(templateApps.templateId, employeeTemplates.templateId))
        .where(
          and(anyOf(employeeTemplates.employeeId, employeeIds), anyOf(templateApps.appId, appIds)),
        ),
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
            sql`(${PAIR.employeeId},${PAIR.appId}) in (select * from unnest(${sql.param(pairs.map((p) => p.employeeId))}::uuid[],${sql.param(pairs.map((p) => p.appId))}::uuid[]))`,
          ),
        )
        .returning(PAIR),
  };
}

const PAIR = { employeeId: employeeAppChoices.employeeId, appId: employeeAppChoices.appId };
