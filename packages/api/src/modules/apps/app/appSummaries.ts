import type { Orm, Tx } from "../../../core/db";
import { type App, appAccountRepository, appConnectionRepository } from "../db";
import { appSince, countSuspendedWithAccess } from "../domain";
import type { ConnectionMembers } from "../ports";
import type { AppSummary } from "./appService";
import { type DirectoryConnectors, findEmployeesInDirectory } from "./directory";
import { findInAppFacts } from "./inAppFacts";

interface SummaryDependencies {
  orm: Orm;
  /** The core's own connectors; the one whose `isDirectory` is set names the directory. */
  connectors: DirectoryConnectors;
  /** The imports module, which knows which connections have finished a scan. */
  members: ConnectionMembers;
}

/**
 * The apps with their people, how those were found, since when, who keeps access though suspended,
 * and whether they are connected.
 */
export async function summarize(
  dependencies: SummaryDependencies,
  apps: readonly App[],
): Promise<AppSummary[]> {
  const { orm, connectors } = dependencies;
  const accounts = appAccountRepository(orm);
  const appIds = apps.map(({ id }) => id);
  const inAppFacts = await findInAppFacts(orm, dependencies);
  const [accountsOfUsers, connectedAppIds, suspended] = await Promise.all([
    accounts.findUsersOfApps(appIds, inAppFacts),
    findConnectedAppIds(orm, appIds),
    findEmployeesInDirectory(orm, connectors, { status: "suspended" }),
  ]);
  const users = accountsOfUsers.filter(({ inApp }) => inApp !== false);
  const usersByApp = Map.groupBy(users, ({ appId }) => appId);
  const suspendedInDirectory = new Set(suspended);
  return apps.map((app) => {
    const appUsers = usersByApp.get(app.id) ?? [];
    const peopleCount = new Set(appUsers.map(({ employeeId }) => employeeId)).size;
    return {
      ...app,
      peopleCount,
      foundVia: [...new Set(appUsers.flatMap(({ foundVia }) => foundVia))].sort(),
      since: appSince(appUsers),
      suspendedWithAccessCount: countSuspendedWithAccess(appUsers, suspendedInDirectory),
      connected: connectedAppIds.has(app.id),
    };
  });
}

/** The apps among these that a connection reads. */
export async function findConnectedAppIds(db: Orm | Tx, appIds: readonly string[]) {
  const connections = await appConnectionRepository(db).findByApps(appIds);
  return new Set(connections.map(({ appId }) => appId));
}
