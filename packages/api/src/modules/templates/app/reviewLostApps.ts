import type { Tx } from "../../../core/db";
import { createRecordHistoryService } from "../../../core/records";
import { PrincipalSecurityContext, type SecurityContext } from "../../../core/security";
import { assignmentRepository, type EmployeeAppPair } from "../db";
import type { PersonAccess, EmployeeById } from "../ports";

const history = createRecordHistoryService();

/** After a source is taken away, mark just the active accounts that no longer have another source. */
export async function reviewLostApps(
  ctx: SecurityContext,
  tx: Tx,
  apps: PersonAccess,
  employees: EmployeeById,
  employeeIds: string[],
  lostAppIds: string[],
) {
  if (!employeeIds.length || !lostAppIds.length) return;
  const repo = assignmentRepository(tx);
  // A directory scan already holds its employees when it reaches the apps.
  await employees.holdForReference(tx, employeeIds);
  const names = await apps.lockAppsForReview(tx, lostAppIds);
  const active = (await apps.findEmployeeAccounts(tx, employeeIds, lostAppIds)).filter(
    (account) => account.status === "active",
  );
  if (!active.length) return;
  const remaining = new Set((await repo.sources(employeeIds, lostAppIds)).map(pairKey));
  const lost = new Map(
    active
      .filter((pair) => !remaining.has(pairKey(pair)))
      .map((pair) => [pairKey(pair), { employeeId: pair.employeeId, appId: pair.appId }]),
  );
  const marked = await repo.markForReview([...lost.values()]);
  await recordChoiceChanges(
    ctx,
    tx,
    marked,
    new Map(names.map((app) => [app.id, app.name])),
    "marked",
  );
}

/** Checks reviews in the apps whose effective access just changed, after the scan or status update. */
export async function clearInactiveReviews(tx: Tx, apps: PersonAccess, appIds: readonly string[]) {
  const repo = assignmentRepository(tx);
  const names = await apps.lockAppsForReview(tx, appIds);
  const reviews = await repo.reviews(appIds);
  if (!reviews.length) return;
  const employeeIds = [...new Set(reviews.map((pair) => pair.employeeId))];
  const accounts = await apps.findEmployeeAccounts(tx, employeeIds, appIds);
  const active = new Set(accounts.filter((account) => account.status === "active").map(pairKey));
  const ended = reviews.filter((pair) => !active.has(pairKey(pair)));
  if (!ended.length) return;
  const cleared = await repo.clearReviews(ended);
  await recordChoiceChanges(
    PrincipalSecurityContext.system(),
    tx,
    cleared,
    new Map(names.map((app) => [app.id, app.name])),
    "cleared",
  );
}

function pairKey({ employeeId, appId }: EmployeeAppPair) {
  return employeeId + "/" + appId;
}

async function recordChoiceChanges(
  ctx: SecurityContext,
  tx: Tx,
  pairs: EmployeeAppPair[],
  names: ReadonlyMap<string, string>,
  action: "marked" | "cleared",
) {
  if (!pairs.length) return;
  const grouped = Map.groupBy(pairs, (pair) => pair.employeeId);
  await history.append(ctx, tx, {
    recordType: "employee",
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
    records: [...grouped].map(([recordId, apps]) => ({
      recordId,
      changes: apps.map(({ appId }) =>
        action === "marked"
          ? {
              field: "appChoice",
              oldValue: null,
              newValue: appId,
              newLabel: names.get(appId) + " — to review",
            }
          : {
              field: "appChoice",
              oldValue: appId,
              oldLabel: names.get(appId) + " — to review",
              newValue: null,
            },
      ),
    })),
  });
}
