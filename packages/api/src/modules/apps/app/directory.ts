import type { AccountStatus, Connector } from "../../../core/connectors";
import type { Orm, Tx } from "../../../core/db";
import { appAccountRepository, appConnectionRepository } from "../db";

/**
 * The core's own connectors: the one whose `isDirectory` is set names the directory, and only they
 * find accounts in other apps.
 */
export type DirectoryConnectors = readonly Pick<
  Connector,
  "key" | "isDirectory" | "findingKinds"
>[];

/** The app of the connection whose connector is the directory; null before it is connected. */
export async function findDirectoryAppId(
  db: Orm | Tx,
  connectors: DirectoryConnectors,
): Promise<string | null> {
  const directory = connectors.find(({ isDirectory }) => isDirectory);
  const connection =
    directory && (await appConnectionRepository(db).findByConnector(directory.key));
  return connection?.appId ?? null;
}

/** The employees whose account in the directory's app has `status`; only those of `among` when given. */
export async function findEmployeesInDirectory(
  db: Orm | Tx,
  connectors: DirectoryConnectors,
  { status, among }: { status: AccountStatus; among?: readonly string[] },
): Promise<string[]> {
  const appId = await findDirectoryAppId(db, connectors);
  return appId ? appAccountRepository(db).findEmployeeIdsWithStatus(appId, status, among) : [];
}
