import type { Tx } from "../../../core/db";
import { createRecordHistoryService } from "../../../core/records";
import { PrincipalSecurityContext, type SecurityContext } from "../../../core/security";
import { assignmentRepository, type EmployeeAppPair } from "../db";
import type { PersonAccess } from "../ports";
import { employeeTemplatesOf } from "./employeeTemplates";

const history = createRecordHistoryService();

/** After a source is taken away, mark just the active accounts that no longer have another source. */
export async function reviewLostApps(
  ctx: SecurityContext,
  tx: Tx,
  apps: PersonAccess,
  employeeIds: string[],
  lostAppIds: string[],
) {
  if (!employeeIds.length || !lostAppIds.length) return;
  const repo = assignmentRepository(tx);
  await repo.lockChoices();
  const remaining = await employeeTemplatesOf(tx, employeeIds);
  const accounts = await apps.findEmployeeAccounts(tx, employeeIds);
  const lost = new Set(lostAppIds);
  const active = Map.groupBy(
    accounts.filter((a) => a.status === "active" && lost.has(a.appId)),
    (a) => a.employeeId,
  );
  const pairs = employeeIds.flatMap((employeeId, index) => {
    const given = new Set(
      remaining[index]!.flatMap((template) => template.apps.map((app) => app.appId)),
    );
    const held = new Set(active.get(employeeId)?.map((account) => account.appId));
    return [...held].filter((appId) => !given.has(appId)).map((appId) => ({ employeeId, appId }));
  });
  // An added or removed choice stays the owner's decision; only new review choices have history.
  const marked = await repo.markForReview(pairs);
  await recordChoiceChanges(ctx, tx, marked, "marked");
}

/** An account change or scan that ends the access also ends its review, in the same transaction. */
export async function clearInactiveReviews(tx: Tx, apps: PersonAccess) {
  const repo = assignmentRepository(tx);
  await repo.lockChoices();
  const byPerson = Map.groupBy(await repo.reviews(), (pair) => pair.employeeId);
  if (!byPerson.size) return;
  const accounts = await apps.findEmployeeAccounts(tx, [...byPerson.keys()]);
  const active = Map.groupBy(
    accounts.filter((account) => account.status === "active"),
    (account) => account.employeeId,
  );
  const cleared: EmployeeAppPair[] = [];
  for (const [employeeId, reviews] of byPerson) {
    const held = new Set(active.get(employeeId)?.map((account) => account.appId));
    const ended = reviews.filter((pair) => !held.has(pair.appId));
    if (!ended.length) continue;
    await repo.clearReviews(
      employeeId,
      ended.map((pair) => pair.appId),
    );
    cleared.push(...ended);
  }
  await recordChoiceChanges(PrincipalSecurityContext.system(), tx, cleared, "cleared");
}

async function recordChoiceChanges(
  ctx: SecurityContext,
  tx: Tx,
  pairs: EmployeeAppPair[],
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
          ? { field: "appChoice", oldValue: null, newValue: appId, newLabel: "To review" }
          : { field: "appChoice", oldValue: appId, oldLabel: "To review", newValue: null },
      ),
    })),
  });
}
