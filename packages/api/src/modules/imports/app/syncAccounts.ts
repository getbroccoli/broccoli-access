import {
  type AccountPhoto,
  type Connector,
  type ImportedAccount,
  listsInvitations,
  type PendingInvitation,
} from "../../../core/connectors";
import type { Tx } from "../../../core/db";
import type { HistoryAppend } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import type { DirectoryPeople, IntegrationUser, ScannedApps } from "../ports";

/** What one scan found, to sync into employees, apps and app accounts. */
export interface ScanFindings {
  sourceId: string;
  connection: { id: string; appId: string };
  connector: Connector;
  accounts: readonly ImportedAccount[];
  /** The app's pending invitations, from every page. */
  invitations: readonly PendingInvitation[];
  /** The directory's changed photos by source key; null for a removed one. */
  photos: ReadonlyMap<string, AccountPhoto | null>;
  /** When the scan began reading: an account changed in its app since keeps its status. */
  readStartedAt: Date;
}

// shortcut: syncs the scanned source's records only, and links another app's accounts to the
// employees as they are now, so a person who joins the directory after an app's scan is linked at
// its next scan; read every source's records once that wait matters.
/**
 * The sync after a scan, joining `tx`: the directory's own accounts create and update employees,
 * with their changed photos, except the integration user's, which is nobody's and a service account
 * like its accounts in other apps; another connector's link to the employee with the same email. They
 * become the connection's app accounts, found via the connector's own-app finding kind; the
 * accounts in other apps go to their matched apps, found via its other-app finding kind. Every
 * change is found by the scan of `sourceId`. The pending invitations of a connector that lists
 * them replace the connection's stored ones. Returns how many accounts it set to the integration
 * user's service kind.
 */
export async function syncAccounts(
  ctx: SecurityContext,
  tx: Tx,
  { sourceId, connection, connector, accounts, invitations, photos, readStartedAt }: ScanFindings,
  {
    apps,
    directory,
    integrationUser,
  }: { apps: ScannedApps; directory: DirectoryPeople; integrationUser: IntegrationUser },
): Promise<{ accountsSetToService: number }> {
  // Before the accounts: a new invitation waits for its connection's row, which a change failing
  // into Reconnect locks before its change rows; deleting an account locks its changes' rows.
  if (listsInvitations(connector)) {
    await apps.replaceInvitations(ctx, tx, { connection, invitations });
  }
  const cause = { kind: "FOUND_BY_SCAN" as const, ref: sourceId };
  const ownAccounts = accounts.filter(({ values }) => values.appExternalId === null);
  const { integrationEmail, employeeIds } = await matchPeople(
    ctx,
    tx,
    { directory, integrationUser },
    { ownAccounts, isDirectory: connector.isDirectory, photos, cause },
  );
  const own = await apps.syncAccounts(ctx, tx, {
    findingKind: connector.findingKinds.ownAppAccounts,
    connectionId: connection.id,
    accounts: ownAccounts.map((account) =>
      foundAccount(account, connection.appId, employeeIds, integrationEmail),
    ),
    cause,
    readStartedAt,
  });
  const { otherAppAccounts } = connector.findingKinds;
  if (!otherAppAccounts) {
    return own;
  }
  const otherAccounts = accounts.filter(({ values }) => values.appExternalId !== null);
  const other = await syncOtherAppAccounts(ctx, tx, apps, {
    findingKind: otherAppAccounts,
    connectionId: connection.id,
    accounts: otherAccounts,
    integrationEmail,
    employeeIds,
    cause,
    readStartedAt,
  });
  return { accountsSetToService: own.accountsSetToService + other.accountsSetToService };
}

/** Matches directory members by their stable id, and other apps' members by directory email. */
async function matchPeople(
  ctx: SecurityContext,
  tx: Tx,
  { directory, integrationUser }: { directory: DirectoryPeople; integrationUser: IntegrationUser },
  {
    ownAccounts,
    isDirectory,
    photos,
    cause,
  }: {
    ownAccounts: ImportedAccount[];
    isDirectory: boolean;
    photos: ScanFindings["photos"];
    cause: HistoryAppend["cause"];
  },
) {
  if (!isDirectory) {
    const employeeIds = await directory.findEmployeeIdsByEmail(
      ctx,
      tx,
      ownAccounts.map(({ values }) => values.email),
    );
    return {
      employeeIds,
      integrationEmail: (await integrationUser.findIntegrationAccountEmail(tx)) ?? undefined,
    };
  }
  const googleId = await integrationUser.readGoogleUserId(ctx, tx);
  const people = ownAccounts.filter(({ sourceKey }) => sourceKey !== googleId);
  return {
    integrationEmail: ownAccounts.find(({ sourceKey }) => sourceKey === googleId)?.values.email,
    employeeIds: await directory.syncDirectoryPeople(
      ctx,
      tx,
      people.map((account) => directoryPerson(account, photos)),
      cause,
    ),
  };
}

/** Matches the accounts' apps, creating the missing ones, then syncs the accounts into them. */
async function syncOtherAppAccounts(
  ctx: SecurityContext,
  tx: Tx,
  apps: ScannedApps,
  {
    findingKind,
    connectionId,
    accounts,
    employeeIds,
    integrationEmail,
    cause,
    readStartedAt,
  }: {
    findingKind: string;
    connectionId: string;
    accounts: readonly ImportedAccount[];
    employeeIds: Map<string, string>;
    integrationEmail: string | undefined;
    cause: HistoryAppend["cause"];
    readStartedAt: Date;
  },
): Promise<{ accountsSetToService: number }> {
  const appIds = await apps.matchFoundApps(ctx, tx, {
    found: accounts.map(({ values }) => ({
      externalId: values.appExternalId!,
      name: values.appName,
    })),
    cause,
  });
  return apps.syncAccounts(ctx, tx, {
    findingKind,
    connectionId,
    accounts: accounts.map((account) =>
      foundAccount(
        account,
        appIds.get(account.values.appExternalId!)!,
        employeeIds,
        integrationEmail,
      ),
    ),
    cause,
    readStartedAt,
  });
}

function foundAccount(
  { values }: ImportedAccount,
  appId: string,
  employeeIds: Map<string, string>,
  integrationEmail: string | undefined,
) {
  return {
    appId,
    email: values.email,
    isIntegrationUser: values.email === integrationEmail,
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
