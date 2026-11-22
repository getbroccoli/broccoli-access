import type { Connector, ImportedAccount } from "../../../core/connectors";
import type { Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import type { DirectoryPeople, ScannedApps } from "../ports";

/** What one scan found, to sync into employees and app accounts. */
export interface ScanFindings {
  sourceId: string;
  connection: { appId: string };
  connector: Connector;
  accounts: readonly ImportedAccount[];
}

// shortcut: syncs the scanned source's records only, which are every source's in circle 1, and
// links accounts to employees only for the directory; read every source's records and match
// employees by email once a second connector comes.
/**
 * The sync after a scan, joining `tx`: the directory's own accounts create and update employees,
 * then become the connection's app accounts, found via the connector's own-app finding kind.
 * Every change is found by the scan of `sourceId`.
 */
export async function syncAccounts(
  ctx: SecurityContext,
  tx: Tx,
  { sourceId, connection, connector, accounts }: ScanFindings,
  { apps, directory }: { apps: ScannedApps; directory: DirectoryPeople },
): Promise<void> {
  const cause = { kind: "FOUND_BY_SCAN" as const, ref: sourceId };
  const ownAccounts = accounts.filter(({ values }) => values.appExternalId === null);
  const employeeIds = connector.isDirectory
    ? await directory.syncDirectoryPeople(ctx, tx, ownAccounts.map(directoryPerson), cause)
    : new Map<string, string>();
  await apps.syncAccounts(ctx, tx, {
    findingKind: connector.findingKinds.ownAppAccounts,
    accounts: ownAccounts.map(({ values: { email, status } }) => ({
      appId: connection.appId,
      email,
      status,
      employeeId: employeeIds.get(email) ?? null,
    })),
    cause,
  });
}

/** A directory account's person; the directory always names them. */
function directoryPerson({ values }: ImportedAccount) {
  return {
    email: values.email,
    firstName: values.firstName ?? "",
    lastName: values.lastName ?? "",
    managerEmail: values.managerEmail,
  };
}
