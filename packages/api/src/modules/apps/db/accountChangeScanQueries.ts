import { and, count, eq, gte, or } from "drizzle-orm";

import { anyOf, type Orm, ormOf, type Tx } from "../../../core/db";
import { accountChanges, COMPLETED_ROSTER_CHANGE } from "./accountChangesTable";

/** Accounts whose Disable or Enable is running or succeeded at or after `since`. */
export async function findAccountsChangedSince(
  db: Orm | Tx,
  appAccountIds: readonly string[],
  since: Date,
): Promise<string[]> {
  const rows = await ormOf(db)
    .selectDistinct({ appAccountId: accountChanges.appAccountId })
    .from(accountChanges)
    .where(
      and(
        anyOf(accountChanges.appAccountId, appAccountIds),
        anyOf(accountChanges.action, ["suspend", "reactivate"]),
        or(
          eq(accountChanges.status, "running"),
          and(eq(accountChanges.status, "succeeded"), gte(accountChanges.finishedAt, since)),
        ),
      ),
    );
  return rows.map(({ appAccountId }) => appAccountId!);
}

/** The committed roster changes are retained, so their count is a monotonic revision. */
export async function readRosterRevision(db: Orm | Tx, connectionId: string): Promise<number> {
  const [row] = await ormOf(db)
    .select({ revision: count() })
    .from(accountChanges)
    .where(and(eq(accountChanges.connectionId, connectionId), COMPLETED_ROSTER_CHANGE));
  return row!.revision;
}
