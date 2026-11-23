import type { ConnectorRegistry } from "../../../core/connectors";
import type { Orm, Tx } from "../../../core/db";
import { appAccountRepository, appConnectionRepository } from "../db";
import type { ScannedConnection } from "../domain";

/**
 * The connections whose first scan has finished, each with its app and the finding kind of its own
 * accounts: in those apps, only the accounts that kind found are access. A connection whose
 * connector is not listed now, such as while the connectors container is down, is left out.
 */
export async function findScannedConnections(
  db: Orm | Tx,
  connectors: ConnectorRegistry,
): Promise<ScannedConnection[]> {
  const [connections, listed] = await Promise.all([
    appConnectionRepository(db).findAll(),
    connectors.list(),
  ]);
  const kinds = new Map(listed.map(({ key, findingKinds }) => [key, findingKinds.ownAppAccounts]));
  const connected = connections.flatMap(({ appId, connector }) => {
    const findingKind = kinds.get(connector);
    return findingKind ? [{ appId, findingKind }] : [];
  });
  // A scan returns at least the connection's own user, so it has finished once its kind found anyone.
  const scanned = new Set(await appAccountRepository(db).findAppIdsFoundVia(connected));
  return connected.filter(({ appId }) => scanned.has(appId));
}
