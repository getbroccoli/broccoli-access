import { applyAccountSync } from "./appAccountService";
import { otherAppFindingKinds } from "./inAppFacts";
import type { AccountChangeDependencies } from "./accountChangeService";
import type { InvitedMember } from "./callAccountChange";
import type { RunnableChange } from "./runAccountChange";
import type { Tx } from "../../../core/db";
import type { HistoryAppend } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { appAccountRepository } from "../db";
import {
  type AccountChange,
  type AccountSyncPlan,
  keepAccountFindings,
  planAccountSync,
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
    // A Remove is only asked through the account's connection.
    const connectionId = change.connectionId!;
    await members.removeMember(tx, {
      connectionId,
      email: change.email,
      sourceKey: change.sourceKey!,
    });
    if (!before) return;
    // A scan may already have found a replacement member with the same email.
    const remaining = await members.findConnectionMembers(tx, {
      connectionIds: [connectionId],
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

/** Saves the invite's read-back through the same account and history path as a scan. */
export async function applyInvitedMember(
  { members, employees, integrationUser }: AccountChangeDependencies,
  ctx: SecurityContext,
  tx: Tx,
  change: RunnableChange,
  { account, findingKind }: InvitedMember,
): Promise<void> {
  if (!(await members.addInvitedMember(tx, change.connectionId, account))) return;
  const { appId, email } = change;
  const known = await appAccountRepository(tx).findByAppAndEmail(appId, email);
  const [employee] = await employees.readEmployeesByEmails(ctx, [email], tx);
  const integrationEmail = await integrationUser.findIntegrationAccountEmail(tx);
  const plan = planAccountSync(known, {
    findingKind,
    found: [
      {
        appId,
        email,
        employeeId: employee?.id ?? null,
        status: account.values.status,
        isIntegrationUser: email === integrationEmail,
        grantedAt: null,
        grantedBefore: null,
      },
    ],
    now: new Date(),
    statusKeptIn: new Set(),
    statusKeptFor: new Set(),
  });
  await applyAccountSync(ctx, tx, plan, {
    cause: { kind: "CHANGED_IN_APP", ref: change.id },
    requestedBy: change.requestedBy,
  });
}
