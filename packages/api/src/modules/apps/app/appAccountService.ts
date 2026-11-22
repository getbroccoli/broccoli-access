import type { Orm, Tx } from "../../../core/db";
import { createRecordHistoryService, type HistoryAppend } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { appAccountRepository } from "../db";
import {
  type AccountSyncPlan,
  accountChanges,
  type FoundAccount,
  planAccountSync,
} from "../domain";

const recordHistory = createRecordHistoryService();

/** People's accounts in apps, as the scans find them. */
export interface AppAccountService {
  /**
   * Makes the accounts `findingKind` saw in its last scan exactly `accounts`: creates new ones,
   * updates the status and employee of known ones, and takes the kind off accounts it no longer
   * sees, deleting those no kind sees; joins `tx` and appends the history of each change with
   * `cause`. System only.
   */
  syncAccounts: (
    ctx: SecurityContext,
    tx: Tx,
    sync: { findingKind: string; accounts: readonly FoundAccount[]; cause: HistoryAppend["cause"] },
  ) => Promise<void>;
  /** How many people have an account in the app, and how many of those are suspended. Trusted read: no `ctx`. */
  countAccounts: (db: Orm | Tx, appId: string) => Promise<{ people: number; suspended: number }>;
}

export function createAppAccountService(): AppAccountService {
  return {
    async syncAccounts(ctx, tx, { findingKind, accounts, cause }) {
      ctx.requireSystem();
      const repository = appAccountRepository(tx);
      const appIds = new Set(accounts.map(({ appId }) => appId));
      const known = await repository.findInAppsOrFoundVia([...appIds], findingKind);
      const plan = planAccountSync(known, { findingKind, found: accounts, now: new Date() });
      await applyPlan(ctx, tx, plan, cause);
    },
    countAccounts: (db, appId) => appAccountRepository(db).countPeople(appId),
  };
}

/** Writes the plan's accounts, then their history: one line per created, updated or deleted account. */
async function applyPlan(
  ctx: SecurityContext,
  tx: Tx,
  { created, updated, deleted }: AccountSyncPlan,
  cause: HistoryAppend["cause"],
): Promise<void> {
  const repository = appAccountRepository(tx);
  const inserted = await repository.insertMany(created);
  // shortcut: one update per changed account; batch them if very large directories come (out of
  // circle 1).
  for (const { after } of updated) {
    await repository.update(after);
  }
  await repository.deleteMany(deleted.map(({ id }) => id));
  const history = [
    {
      operation: "CREATED" as const,
      records: inserted.map((account) => ({
        recordId: account.id,
        changes: accountChanges(null, account),
      })),
    },
    {
      operation: "UPDATED" as const,
      records: updated.map(({ before, after }) => ({
        recordId: after.id,
        changes: accountChanges(before, after),
      })),
    },
    {
      operation: "DELETED" as const,
      records: deleted.map((account) => ({
        recordId: account.id,
        changes: accountChanges(account, null),
      })),
    },
  ];
  for (const { operation, records } of history) {
    if (records.length > 0) {
      await recordHistory.append(ctx, tx, { recordType: "app_account", operation, cause, records });
    }
  }
}
