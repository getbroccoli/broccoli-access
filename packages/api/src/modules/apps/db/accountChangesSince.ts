import { and, eq, gte, isNotNull, or } from "drizzle-orm";

import { anyOf, type Orm, ormOf, type Tx } from "../../../core/db";
import { accountChanges } from "./accountChangesTable";

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

/** Whether an instant invite succeeded through this connection at or after `since`. */
export async function hasInstantInviteSince(
  db: Orm | Tx,
  connectionId: string,
  since: Date,
): Promise<boolean> {
  const [row] = await ormOf(db)
    .select({ id: accountChanges.id })
    .from(accountChanges)
    .where(
      and(
        eq(accountChanges.connectionId, connectionId),
        eq(accountChanges.action, "invite"),
        eq(accountChanges.status, "succeeded"),
        isNotNull(accountChanges.sourceKey),
        gte(accountChanges.finishedAt, since),
      ),
    )
    .limit(1);
  return row !== undefined;
}
