import { account, user } from "../../src/core/auth";
import type { Orm } from "../../src/core/db";
import { apps, appConnections } from "../../src/modules/apps/db";

/** Raw persistence reads for assertions about atomicity and secret storage. */
export function storedApps(orm: Orm) {
  return orm.select().from(apps);
}
export function storedAppConnections(orm: Orm) {
  return orm.select().from(appConnections);
}
export function storedGoogleAccounts(orm: Orm) {
  return orm.select().from(account);
}
export function storedUsers(orm: Orm) {
  return orm.select().from(user);
}
