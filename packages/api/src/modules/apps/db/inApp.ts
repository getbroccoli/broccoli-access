import { and, eq, isNull, ne, type SQL, sql } from "drizzle-orm";
import { anyOf } from "../../../core/db";
import type { InAppFacts } from "../domain";
import { appAccounts } from "./appAccountsTable";

import { apps } from "./appsTable";

/** Whether the account is access: an account not in its app is not. */
export function isAccess(facts: InAppFacts): SQL {
  return sql`(${inApp(facts)}) is not false`;
}

/**
 * Whether the account is in its app: in an app whose connection has finished a scan, whether a kind
 * other than the other-app ones found it; null elsewhere, where every account counts.
 */
export function inApp({ scannedAppIds, otherAppKinds }: InAppFacts): SQL<boolean | null> {
  // The builder has no CASE, and its array operators refuse an empty list.
  return sql<
    boolean | null
  >`case when ${anyOf(appAccounts.appId, scannedAppIds)} then not (${appAccounts.foundVia} <@ ${sql.param([...otherAppKinds])}::text[]) end`;
}

/** Which unlinked accounts People shows in this list. */
export function unlinkedAccounts(facts: InAppFacts, group: "personal" | "marked") {
  return and(
    eq(apps.status, "approved"),
    group === "personal" ? eq(appAccounts.kind, "personal") : ne(appAccounts.kind, "personal"),
    isNull(appAccounts.employeeId),
    isAccess(facts),
  );
}
