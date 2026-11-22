import type { Connector } from "../../../core/connectors";
import type { Orm, Tx } from "../../../core/db";
import { appAccountRepository, appConnectionRepository } from "../db";

/** The connectors the scans read; the one whose `isDirectory` is set names the directory. */
export type DirectoryConnectors = readonly Pick<Connector, "key" | "isDirectory">[];

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

/** The employees whose account in the directory's app is suspended. */
export async function findEmployeesSuspendedInDirectory(
  db: Orm | Tx,
  connectors: DirectoryConnectors,
): Promise<string[]> {
  const appId = await findDirectoryAppId(db, connectors);
  return appId ? appAccountRepository(db).findSuspendedEmployeeIds(appId) : [];
}
