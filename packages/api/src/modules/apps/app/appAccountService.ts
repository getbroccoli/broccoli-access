import type { Orm, Tx } from "../../../core/db";
import { createRecordHistoryService, type HistoryAppend } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { accountChangeRepository, appAccountRepository, appConnectionRepository } from "../db";
import {
  type AccountSyncPlan,
  accountChanges,
  type FoundAccount,
  isAutomaticService,
  planAccountSync,
} from "../domain";

const recordHistory = createRecordHistoryService();

/** People's accounts in apps, as the scans find them. */
export interface AppAccountService {
  /**
   * Makes the accounts `findingKind` saw in the last scan of connection `connectionId` exactly
   * `accounts`: creates new ones, updates the status and employee of known ones, and takes the
   * kind off accounts it no longer sees, deleting those no kind sees; joins `tx` and appends the
   * history of each change with `cause`. A known account in an app another connection reads keeps
   * its status, which that connection's records decide, and so does one whose account change runs
   * or succeeded since `readStartedAt`, which the scan may have read before. Syncs run one at a
   * time. Returns how many accounts it set to the integration user's service kind. System only.
   */
  syncAccounts: (
    ctx: SecurityContext,
    tx: Tx,
    sync: {
      findingKind: string;
      connectionId: string;
      accounts: readonly FoundAccount[];
      cause: HistoryAppend["cause"];
      /** When the scan began reading its connection. */
      readStartedAt: Date;
    },
  ) => Promise<{ accountsSetToService: number }>;
  /**
   * Holds off other account syncs and connects until `tx` ends, waiting for one running now. A
   * scan's save takes it before anything else, so two saves never deadlock over employees.
   * System only.
   */
  holdAccountSyncs: (ctx: SecurityContext, tx: Tx) => Promise<void>;
  /** How many people have an account in the app, and how many of those are suspended. Trusted read: no `ctx`. */
  countAccounts: (db: Orm | Tx, appId: string) => Promise<{ people: number; suspended: number }>;
  /** How many apps hold an account `findingKind` saw in its last scan. Trusted read: no `ctx`. */
  countAppsFoundVia: (db: Orm | Tx, findingKind: string) => Promise<number>;
}

export function createAppAccountService(): AppAccountService {
  return {
    async syncAccounts(ctx, tx, { findingKind, connectionId, accounts, cause, readStartedAt }) {
      ctx.requireSystem();
      const repository = appAccountRepository(tx);
      // Another source's sync may have just changed these accounts: read them after it commits.
      await repository.lockForSync();
      const appIds = [...new Set(accounts.map(({ appId }) => appId))];
      const known = await repository.findInAppsOrFoundVia(appIds, findingKind);
      const otherConnections = (await appConnectionRepository(tx).findByApps(appIds)).filter(
        ({ id }) => id !== connectionId,
      );
      const changed = await accountChangeRepository(tx).findAccountsChangedSince(
        known.map(({ id }) => id),
        readStartedAt,
      );
      const plan = planAccountSync(known, {
        findingKind,
        found: accounts,
        now: new Date(),
        statusKeptIn: new Set(otherConnections.map(({ appId }) => appId)),
        statusKeptFor: new Set(changed),
      });
      await applyPlan(ctx, tx, plan, cause);
      return { accountsSetToService: countSetToService(plan) };
    },
    async holdAccountSyncs(ctx, tx) {
      ctx.requireSystem();
      await appAccountRepository(tx).lockForSync();
    },
    countAccounts: (db, appId) => appAccountRepository(db).countPeople(appId),
    countAppsFoundVia: (db, findingKind) => appAccountRepository(db).countAppsFoundVia(findingKind),
  };
}

function countSetToService({ created, updated }: AccountSyncPlan): number {
  return (
    created.filter(isAutomaticService).length +
    updated.filter(({ before, after }) => !isAutomaticService(before) && isAutomaticService(after))
      .length
  );
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
  const appIds = new Set(
    [...inserted, ...updated.map((change) => change.after), ...deleted].map(
      (account) => account.appId,
    ),
  );
  if (appIds.size) tx.publish("apps.accountsChanged", { appIds: [...appIds], cause });
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
