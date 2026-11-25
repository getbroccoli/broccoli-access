import { type Orm, readSnapshot } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { assignmentRepository, type EmployeeAppPair } from "../db";
import { appsOfPerson, extraAppReason, type PersonApp } from "../domain";
import type { PersonAccess } from "../ports";
import { employeeAppFactsOf } from "./employeeAppFactsOf";

export interface AccessDifferences {
  missing: EmployeeAppPair[];
  extra: ExtraAppDifference[];
  runningChangeCount: number;
  templateSummaries: Map<string, TemplateDifferenceSummary>;
}

export type AccessDifference = EmployeeAppPair & Partial<ExtraAppDifference>;

interface ExtraAppDifference extends EmployeeAppPair {
  accountIds: string[];
  reason: NonNullable<ReturnType<typeof extraAppReason>>;
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
    const runningChangeCount = await apps.readRunningChangeCount(ctx, db);
    const factsByPerson = await employeeAppFactsOf({ db, apps, ctx, employeeIds, invites: [] });
    const appsByPerson = factsByPerson.map(appsOfPerson);
    const expected = appsByPerson.flatMap((rows, index) =>
      rows.flatMap(({ appId, state }) =>
        state === "missing" ? [{ employeeId: employeeIds[index]!, appId }] : [],
      ),
    );
    const invites = await apps.readAppInvites(
      ctx,
      [...new Set(expected.map(({ employeeId }) => employeeId))],
      db,
      expected,
    );
    const invited = new Set(invites.map(({ employeeId, appId }) => employeeId + "/" + appId));
    const differences: AccessDifferences = {
      missing: [],
      extra: [],
      runningChangeCount,
      templateSummaries: new Map(),
    };
    for (const [index, facts] of factsByPerson.entries())
      collectDifferences(differences, employeeIds[index]!, {
        facts,
        rows: appsByPerson[index]!,
        invited,
      });
    return differences;
  });
}

function collectDifferences(
  differences: AccessDifferences,
  employeeId: string,
  {
    facts,
    rows,
    invited,
  }: {
    facts: Awaited<ReturnType<typeof employeeAppFactsOf>>[number];
    rows: PersonApp[];
    invited: ReadonlySet<string>;
  },
) {
  const choices = new Map(facts.choices.map(({ appId, choice }) => [appId, choice]));
  const active = Map.groupBy(
    facts.accounts.filter(({ status }) => status === "active"),
    ({ appId }) => appId,
  );
  for (const { appId, state } of rows) {
    const pair = { employeeId, appId };
    let extraCount = 0;
    if (state === "missing") {
      if (invited.has(employeeId + "/" + appId)) continue;
      differences.missing.push(pair);
    } else if (state === "extra") {
      const reason = extraAppReason(
        choices.get(appId),
        facts.templates.length > 0 && facts.listedApps.has(appId),
      );
      if (!reason) continue;
      const accountIds = (active.get(appId) ?? []).map(({ id }) => id);
      differences.extra.push({ ...pair, reason, accountIds });
      extraCount = accountIds.length;
    } else continue;
    for (const { id } of facts.templates) {
      const summary = differences.templateSummaries.get(id) ?? {
        missingCount: 0,
        extraCount: 0,
        missingAppId: null,
      };
      addDifference(summary, { appId, extraCount });
      differences.templateSummaries.set(id, summary);
    }
  }
}

function addDifference(
  summary: TemplateDifferenceSummary,
  { appId, extraCount }: { appId: string; extraCount: number },
) {
  if (extraCount) {
    summary.extraCount += extraCount;
    return;
  }
  if (summary.missingCount === 0) summary.missingAppId = appId;
  if (summary.missingAppId !== appId) summary.missingAppId = null;
  summary.missingCount++;
}
