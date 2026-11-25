import { ApplicationError } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { parseUuid } from "../../../utils";
import { accountChangeRepository, appAccountRepository, appRepository } from "../db";
import { type AccountChangeAction, type ChangeStart, startOfChange } from "../domain";
import {
  type AccountChangeDependencies,
  type LatestAccountChange,
  RUN_JOB,
  withPlace,
} from "./accountChangeService";
import { type ChangingConnectors, ensureSameRetry, readAccountFacts } from "./accountFacts";

/** Writes the running change and queues its run in the connection's group, refusing what is not offered. */
export async function askForChange(
  dependencies: AccountChangeDependencies,
  tx: Tx,
  { appAccountId, action, requestedBy, changing, retryOf, start, onlyIfExtra }: AskedChange,
): Promise<LatestAccountChange> {
  const id = parseUuid(appAccountId);
  // Locked, so a change finishing meanwhile commits first and its outcome is read below.
  const account = id && (await appAccountRepository(tx).lockById(id));
  if (!account) {
    throw new ApplicationError("NOT_FOUND", "No app account has this id.");
  }
  if (onlyIfExtra) await requireExtraAccount(dependencies, tx, onlyIfExtra, account, action);
  const facts = await readAccountFacts(dependencies, tx, [account], changing);
  const { offered, offersRemove, connection, member } = facts.get(account.id)!;
  if (retryOf != null) ensureSameRetry(facts.get(account.id)!, action, retryOf);
  // shortcut: a first confirmation follows a replacement suspended member at the same email;
  // bind the opened dialog to the upstream key if memberships start changing during confirmation.
  const allowed = action === "remove" ? offersRemove : offered === action;
  if (!allowed || !connection || !member) {
    throw new ApplicationError("CONFLICT", NOT_OFFERED);
  }
  const changes = accountChangeRepository(tx);
  const change = await changes.insertRunning({
    appAccountId: account.id,
    appId: account.appId,
    email: account.email,
    connectionId: connection.id,
    action,
    sourceKey: member.sourceKey,
    role: null,
    requestedBy,
    requestedAt: new Date(),
    ...startOfChange(
      { ...start, action, subjectEmployeeId: account.employeeId },
      facts.get(account.id)!.latest,
    ),
  });
  // A concurrent ask of the same account committed first.
  if (!change) {
    throw new ApplicationError("CONFLICT", NOT_OFFERED);
  }
  await dependencies.jobs.send(tx, RUN_JOB, { changeId: change.id }, { group: connection.id });
  return withPlace(change, await changes.countChangesAhead([change.id]));
}

/** What the owner asks of one account, and where they asked. */
interface AskedChange {
  appAccountId: string;
  action: AccountChangeAction;
  requestedBy: string;
  changing: ChangingConnectors;
  /** The failed change a Try again repeats. */
  retryOf?: string | null;
  onlyIfExtra?: SecurityContext;
  start: ChangeStart;
}

async function requireExtraAccount(
  dependencies: AccountChangeDependencies,
  tx: Tx,
  ctx: SecurityContext,
  { employeeId, appId }: { employeeId: string | null; appId: string },
  action: AccountChangeAction,
) {
  // Do not wait while holding the account: another change can hold this app and need the account.
  const stillExtra =
    action === "suspend" &&
    employeeId &&
    (await appRepository(tx).tryLockForReview(appId)) &&
    (await dependencies.isExtraApp(ctx, { employeeId, appId }, tx));
  if (!stillExtra)
    throw new ApplicationError("CONFLICT", "This account is no longer extra for this person.");
}

const NOT_OFFERED = "This change is not offered on this account now.";
