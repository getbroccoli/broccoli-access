import { type Orm, readSnapshot } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { assignmentRepository, type EmployeeAppPair } from "../db";
import type { PersonAccess } from "../ports";
import { employeeAppsOf } from "./employeeAppsOf";
import { employeeTemplatesOf } from "./employeeTemplates";

export interface AccessDifferences {
  missing: EmployeeAppPair[];
  extra: EmployeeAppPair[];
  templateSummaries: Map<string, TemplateDifferenceSummary>;
}

export interface TemplateDifferenceSummary {
  missingCount: number;
  extraCount: number;
  missingAppId: string | null;
}

/** Reads the differences and the templates assigned to their people from one snapshot. */
export function readDifferences(orm: Orm, apps: PersonAccess, ctx: SecurityContext) {
  ctx.require("MANAGE_WORKSPACE");
  return readSnapshot(orm, async (db): Promise<AccessDifferences> => {
    const employeeIds = await assignmentRepository(db).employeesWithAccessSources();
    const templates = await employeeTemplatesOf(db, employeeIds);
    const rowsByPerson = await employeeAppsOf({ db, apps, ctx, employeeIds, templates });
    const differences: AccessDifferences = { missing: [], extra: [], templateSummaries: new Map() };
    for (const [index, rows] of rowsByPerson.entries()) {
      for (const { appId, state } of rows) {
        if (state !== "missing" && state !== "extra") continue;
        differences[state].push({ employeeId: employeeIds[index]!, appId });
        for (const { id } of templates[index]!) {
          const summary = differences.templateSummaries.get(id) ?? {
            missingCount: 0,
            extraCount: 0,
            missingAppId: null,
          };
          addDifference(summary, state, appId);
          differences.templateSummaries.set(id, summary);
        }
      }
    }
    return differences;
  });
}

function addDifference(
  summary: TemplateDifferenceSummary,
  state: "missing" | "extra",
  appId: string,
) {
  if (state === "extra") {
    summary.extraCount++;
    return;
  }
  if (summary.missingCount === 0) summary.missingAppId = appId;
  if (summary.missingAppId !== appId) summary.missingAppId = null;
  summary.missingCount++;
}
