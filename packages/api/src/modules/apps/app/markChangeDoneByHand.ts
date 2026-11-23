import { ApplicationError } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { parseUuid } from "../../../utils";
import { accountChangeRepository, appAccountRepository } from "../db";
import type { AccountChange } from "../domain";
import type { AccountChangeDependencies, LatestAccountChange } from "./accountChangeService";
import { setAccountStatus } from "./setAccountStatus";

/**
 * "I did it by hand": the failed change, its account's latest, becomes `done_by_hand`, and the
 * account takes the status the change asked for, with a history line by the signed-in user.
 */
export async function markChangeDoneByHand(
  { transact, logger }: AccountChangeDependencies,
  ctx: SecurityContext,
  changeId: string,
): Promise<LatestAccountChange> {
  ctx.require("MANAGE_WORKSPACE");
  if (!ctx.user) {
    throw new ApplicationError("FORBIDDEN", "Only a signed-in user can make a change by hand.");
  }
  const id = parseUuid(changeId);
  if (!id) {
    throw new ApplicationError("NOT_FOUND", NOT_FOUND);
  }
  const done = await transact(async (tx) => {
    const change = await lockLatestFailure(tx, id);
    const marked = await accountChangeRepository(tx).markDoneByHand(change.id);
    await setAccountStatus(ctx, tx, marked, { cause: { kind: "DONE_BY_HAND", ref: marked.id } });
    return marked;
  });
  logger.info(
    { changeId: done.id, appAccountId: done.appAccountId, action: done.action },
    "Account change done by hand",
  );
  return { ...done, changesAhead: null };
}

const NOT_FOUND = "No account change has this id.";

const NOT_LATEST_FAILURE =
  "Only an account's latest change, once it failed, can be marked as done by hand.";

/**
 * Locks the change and its account, refusing an unknown change, and one that has not failed or that
 * a Try again followed.
 */
async function lockLatestFailure(tx: Tx, id: string): Promise<AccountChange> {
  // The lock scans take first: a scan deleting the account also locks this change.
  await appAccountRepository(tx).lockForSync();
  const changes = accountChangeRepository(tx);
  const change = await changes.lockById(id);
  if (!change) {
    throw new ApplicationError("NOT_FOUND", NOT_FOUND);
  }
  if (change.status !== "failed" || !change.appAccountId) {
    throw new ApplicationError("CONFLICT", NOT_LATEST_FAILURE);
  }
  // A Try again asked meanwhile holds the account until it commits, and is then read below.
  await appAccountRepository(tx).lockById(change.appAccountId);
  const [latest] = await changes.findLatestOfAccounts([change.appAccountId]);
  if (latest?.id !== change.id) {
    throw new ApplicationError("CONFLICT", NOT_LATEST_FAILURE);
  }
  return change;
}
