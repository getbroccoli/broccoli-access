import type { Tx } from "../../../core/db";
import { createRecordHistoryService, type HistoryAppend } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { appAccountRepository } from "../db";
import { type AccountChange, accountChanges, statusAfter } from "../domain";

const recordHistory = createRecordHistoryService();

/**
 * Gives the change's account the status the change asked for, with a history line for `line`'s
 * cause; nothing when a scan deleted the account or it already has that status.
 */
export async function setAccountStatus(
  ctx: SecurityContext,
  tx: Tx,
  change: AccountChange,
  line: Pick<HistoryAppend, "cause" | "requestedBy">,
): Promise<void> {
  const accounts = appAccountRepository(tx);
  const [before] = change.appAccountId ? await accounts.findByIds([change.appAccountId]) : [];
  const status = statusAfter(change.action);
  if (!before || before.status === status) {
    return;
  }
  const after = { ...before, status };
  await accounts.update(after);
  await recordHistory.append(ctx, tx, {
    ...line,
    recordType: "app_account",
    operation: "UPDATED",
    records: [{ recordId: before.id, changes: accountChanges(before, after) }],
  });
}
