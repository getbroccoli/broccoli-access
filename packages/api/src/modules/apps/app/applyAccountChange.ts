import { applyAccountSync } from "./appAccountService";
import { otherAppFindingKinds } from "./inAppFacts";
import type { AccountChangeDependencies } from "./accountChangeService";
import type { Tx } from "../../../core/db";
import type { HistoryAppend } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { appAccountRepository } from "../db";
import {
  type AccountChange,
  type AccountSyncPlan,
  keepAccountFindings,
  statusAfter,
} from "../domain";

/** Applies a confirmed change to the local account and its history in the same transaction. */
export async function applyAccountChange(
  { members, directoryConnectors }: AccountChangeDependencies,
  ctx: SecurityContext,
  tx: Tx,
  change: AccountChange,
  line: Pick<HistoryAppend, "cause" | "requestedBy">,
): Promise<void> {
  if (change.action === "invite") {
    return;
  }
  const accounts = appAccountRepository(tx);
  const [before] = change.appAccountId ? await accounts.findByIds([change.appAccountId]) : [];
  const plan: AccountSyncPlan = { created: [], updated: [], deleted: [] };
  if (change.action === "remove") {
    await members.removeMember(tx, {
      connectionId: change.connectionId,
      email: change.email,
      sourceKey: change.sourceKey!,
    });
    if (!before) return;
    // A scan may already have found a replacement member with the same email.
    const remaining = await members.findConnectionMembers(tx, {
      connectionIds: [change.connectionId],
      emails: [change.email],
    });
    if (remaining.length) return;
    const otherKinds = otherAppFindingKinds(directoryConnectors);
    const foundVia = before.foundVia.filter((kind) => otherKinds.includes(kind));
    if (foundVia.length === before.foundVia.length) return;
    keepAccountFindings(plan, before, foundVia);
  } else {
    const status = statusAfter(change.action);
    if (!before || before.status === status) return;
    plan.updated.push({ before, after: { ...before, status } });
  }
  await applyAccountSync(ctx, tx, plan, line);
}
