import type { AccountPhoto, Connector, ImportedAccount } from "../../../core/connectors";
import type { Tx } from "../../../core/db";
import type { HistoryAppend } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import type { DirectoryPeople, ScannedApps } from "../ports";

/** What one scan found, to sync into employees, apps and app accounts. */
export interface ScanFindings {
  sourceId: string;
  connection: { appId: string };
  connector: Connector;
  accounts: readonly ImportedAccount[];
  /** The directory's changed photos by source key; null for a removed one. */
  photos: ReadonlyMap<string, AccountPhoto | null>;
}

// shortcut: syncs the scanned source's records only, which are every source's in circle 1, and
// links accounts to the employees the directory's own scan returns; read every source's records
// and match employees by email once a second connector comes.
/**
 * The sync after a scan, joining `tx`: the directory's own accounts create and update employees,
 * with their changed photos, then become the connection's app accounts, found via the
 * connector's own-app finding kind; the accounts in other apps go to their matched apps, found
 * via its other-app finding kind. Every change is found by the scan of `sourceId`.
 */
export async function syncAccounts(
  ctx: SecurityContext,
  tx: Tx,
  { sourceId, connection, connector, accounts, photos }: ScanFindings,
  { apps, directory }: { apps: ScannedApps; directory: DirectoryPeople },
): Promise<void> {
  const cause = { kind: "FOUND_BY_SCAN" as const, ref: sourceId };
  const ownAccounts = accounts.filter(({ values }) => values.appExternalId === null);
  const employeeIds = connector.isDirectory
    ? await directory.syncDirectoryPeople(
        ctx,
        tx,
        ownAccounts.map((account) => directoryPerson(account, photos)),
        cause,
      )
    : new Map<string, string>();
  await apps.syncAccounts(ctx, tx, {
    findingKind: connector.findingKinds.ownAppAccounts,
    accounts: ownAccounts.map((account) => foundAccount(account, connection.appId, employeeIds)),
    cause,
  });
  const { otherAppAccounts } = connector.findingKinds;
  if (otherAppAccounts) {
    const otherAccounts = accounts.filter(({ values }) => values.appExternalId !== null);
    await syncOtherAppAccounts(ctx, tx, apps, {
      findingKind: otherAppAccounts,
      accounts: otherAccounts,
      employeeIds,
      cause,
    });
  }
}

/** Matches the accounts' apps, creating the missing ones, then syncs the accounts into them. */
async function syncOtherAppAccounts(
  ctx: SecurityContext,
  tx: Tx,
  apps: ScannedApps,
  {
    findingKind,
    accounts,
    employeeIds,
    cause,
  }: {
    findingKind: string;
    accounts: readonly ImportedAccount[];
    employeeIds: Map<string, string>;
    cause: HistoryAppend["cause"];
  },
): Promise<void> {
  const appIds = await apps.matchFoundApps(ctx, tx, {
    found: accounts.map(({ values }) => ({
      externalId: values.appExternalId!,
      name: values.appName,
    })),
    cause,
  });
  await apps.syncAccounts(ctx, tx, {
    findingKind,
    accounts: accounts.map((account) =>
      foundAccount(account, appIds.get(account.values.appExternalId!)!, employeeIds),
    ),
    cause,
  });
}

function foundAccount(
  { values }: ImportedAccount,
  appId: string,
  employeeIds: Map<string, string>,
) {
  return {
    appId,
    email: values.email,
    status: values.status,
    employeeId: employeeIds.get(values.email) ?? null,
    grantedAt: values.grantedAt === null ? null : new Date(values.grantedAt),
    grantedBefore: values.grantedBefore === null ? null : new Date(values.grantedBefore),
  };
}

/** A directory account's person and changed photo; the directory always names them. */
function directoryPerson(
  { sourceKey, values }: ImportedAccount,
  photos: ReadonlyMap<string, AccountPhoto | null>,
) {
  return {
    email: values.email,
    firstName: values.firstName ?? "",
    lastName: values.lastName ?? "",
    managerEmail: values.managerEmail,
    photo: photos.get(sourceKey),
  };
}
