import { and, eq, sql } from "drizzle-orm";
import { anyOf, insertBatches, type Orm, ormOf, type Tx } from "../../../core/db";
import type { EmployeeAppChoice } from "../domain";
import { employeeAppChoices } from "./employeeAppChoicesTable";
import { employeeTemplates } from "./employeeTemplatesTable";
import { templateApps } from "./templateAppsTable";

/** Template assignments and exceptions, read in batches and changed in the caller's transaction. */
export interface AssignmentRepository {
  forEmployees(ids: readonly string[]): Promise<Assignment[]>;
  forTemplates(ids: readonly string[]): Promise<Assignment[]>;
  assign(assignment: Assignment, assignedBy: string): Promise<boolean>;
  takeOff(assignment: Assignment): Promise<boolean>;
  choicesFor(ids: readonly string[]): Promise<EmployeeAppChoice[]>;
  listedApps(ids: readonly string[]): Promise<Set<string>>;
  /** Serialises last-source decisions across different templates and account status changes. */
  lockChoices(): Promise<void>;
  markForReview(pairs: EmployeeAppPair[]): Promise<EmployeeAppPair[]>;
  reviews(): Promise<EmployeeAppPair[]>;
  clearReviews(employeeId: string, appIds: string[]): Promise<void>;
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
    forTemplates: (ids) =>
      assignments().where(anyOf(employeeTemplates.templateId, ids)).orderBy(employeeTemplates.id),
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
    choicesFor: (ids) =>
      orm.select().from(employeeAppChoices).where(anyOf(employeeAppChoices.employeeId, ids)),
    async listedApps(ids) {
      const listed = await orm
        .selectDistinct({ appId: templateApps.appId })
        .from(templateApps)
        .where(anyOf(templateApps.appId, ids));
      return new Set(listed.map(({ appId }) => appId));
    },
    async lockChoices() {
      // No row exists to lock before the last source goes away.
      await orm.execute(sql`lock table ${employeeAppChoices} in share row exclusive mode`);
    },
    async markForReview(pairs) {
      const inserted: EmployeeAppPair[] = [];
      for (const batch of insertBatches(pairs)) {
        const rows = await orm
          .insert(employeeAppChoices)
          .values(batch.map((pair) => ({ ...pair, choice: "to_review" as const })))
          .onConflictDoUpdate({
            target: [employeeAppChoices.employeeId, employeeAppChoices.appId],
            set: { choice: "to_review", role: null },
            setWhere: eq(employeeAppChoices.choice, "role_picked"),
          })
          .returning(PAIR);
        inserted.push(...rows);
      }
      return inserted;
    },
    reviews: () =>
      orm.select(PAIR).from(employeeAppChoices).where(eq(employeeAppChoices.choice, "to_review")),
    async clearReviews(employeeId, appIds) {
      await orm
        .delete(employeeAppChoices)
        .where(
          and(
            eq(employeeAppChoices.employeeId, employeeId),
            anyOf(employeeAppChoices.appId, appIds),
            eq(employeeAppChoices.choice, "to_review"),
          ),
        );
    },
  };
}

const PAIR = { employeeId: employeeAppChoices.employeeId, appId: employeeAppChoices.appId };
