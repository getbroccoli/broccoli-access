import { eq } from "drizzle-orm";

import { account, user } from "../../src/core/auth";
import type { Orm } from "../../src/core/db";
import { appConnections } from "../../src/modules/apps/db";

/** Raw persistence reads for assertions about atomicity and secret storage. */
export function storedAppConnections(orm: Orm) {
  return orm.select().from(appConnections);
}
export function storedGoogleAccounts(orm: Orm) {
  return orm.select().from(account);
}
export function storedUsers(orm: Orm) {
  return orm.select().from(user);
}

/** Gives the connection a different workspace from the fake Google's single customer. */
export async function changeStoredGoogleDomain(orm: Orm, connectionId: string, domain: string) {
  const [connection] = await orm
    .select()
    .from(appConnections)
    .where(eq(appConnections.id, connectionId));
  await orm
    .update(appConnections)
    .set({ settings: { ...connection!.settings, domain } })
    .where(eq(appConnections.id, connectionId));
}
