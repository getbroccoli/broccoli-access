import type { Orm, Tx } from "../../../core/db";
import { assignmentRepository, templateRepository } from "../db";

/** Reads the assigned templates with their apps in assignment order, one list per employee id. */
export async function employeeTemplatesOf(db: Orm | Tx, employeeIds: readonly string[]) {
  const assignments = await assignmentRepository(db).forEmployees(employeeIds);
  const templates = await templateRepository(db).findByIds([
    ...new Set(assignments.map((row) => row.templateId)),
  ]);
  const byId = new Map(templates.map((template) => [template.id, template]));
  const byPerson = Map.groupBy(assignments, (row) => row.employeeId);
  return employeeIds.map((id) =>
    (byPerson.get(id) ?? []).flatMap((row) => byId.get(row.templateId) ?? []),
  );
}
