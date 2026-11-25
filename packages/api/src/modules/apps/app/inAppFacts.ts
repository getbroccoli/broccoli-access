import type { Orm, Tx } from "../../../core/db";
import { appConnectionRepository } from "../db";
import type { InAppFacts } from "../domain";
import type { ConnectionMembers } from "../ports";
import type { DirectoryConnectors } from "./directory";

/** What tells whether each account is in its app, read from what the scans saved. */
export async function findInAppFacts(
  db: Orm | Tx,
  { connectors, members }: { connectors: DirectoryConnectors; members: ConnectionMembers },
): Promise<InAppFacts> {
  const [connections, lastScans] = await Promise.all([
    appConnectionRepository(db).findAll(),
    members.findLastScans(db),
  ]);
  const scanned = new Set(lastScans.map(({ connectionId }) => connectionId));
  return {
    scannedAppIds: connections.filter(({ id }) => scanned.has(id)).map(({ appId }) => appId),
    // Only the core's connectors find accounts in other apps; a container connector finds its own.
    // shortcut: trusts that a connector keeps its finding kind, since a renamed kind stays on accounts
    // a Google sign-in keeps; read the scan's own records instead if kinds ever get renamed.
    otherAppKinds: otherAppFindingKinds(connectors),
  };
}

export function otherAppFindingKinds(connectors: DirectoryConnectors): string[] {
  return connectors.flatMap(({ findingKinds }) => findingKinds.otherAppAccounts ?? []);
}
