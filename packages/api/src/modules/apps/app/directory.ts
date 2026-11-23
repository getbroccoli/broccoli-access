import type { ConnectorRegistry } from "../../../core/connectors";
import type { Orm, Tx } from "../../../core/db";
import { appAccountRepository, appConnectionRepository } from "../db";

/** The app of the connection whose connector is the directory; null before it is connected. */
export async function findDirectoryAppId(
  db: Orm | Tx,
  connectors: ConnectorRegistry,
): Promise<string | null> {
  const directory = (await connectors.list()).find(({ isDirectory }) => isDirectory);
  const connection =
    directory && (await appConnectionRepository(db).findByConnector(directory.key));
  return connection?.appId ?? null;
}

/** The employees whose account in the directory's app is suspended. */
export async function findEmployeesSuspendedInDirectory(
  db: Orm | Tx,
  connectors: ConnectorRegistry,
): Promise<string[]> {
  const appId = await findDirectoryAppId(db, connectors);
  return appId ? appAccountRepository(db).findSuspendedEmployeeIds(appId) : [];
}
