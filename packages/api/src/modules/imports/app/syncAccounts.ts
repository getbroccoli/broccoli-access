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
 * with their changed photos, except the integration user's, which is nobody's; another connector's link to the employee with the same email. They
 * become the connection's app accounts, found via the connector's own-app finding kind; the
 * accounts in other apps go to their matched apps, found via its other-app finding kind. Every
 * change is found by the scan of `sourceId`. The pending invitations of a connector that lists
 * them replace the connection's stored ones.
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
): Promise<void> {
  // Before the accounts: a new invitation waits for its connection's row, which a change failing
  // into Reconnect locks before its change rows; deleting an account locks its changes' rows.
  if (listsInvitations(connector)) {
    await apps.replaceInvitations(ctx, tx, { connection, invitations });
  }
  const cause = { kind: "FOUND_BY_SCAN" as const, ref: sourceId };
  const ownAccounts = accounts.filter(({ values }) => values.appExternalId === null);
  const employeeIds = connector.isDirectory
    ? await directory.syncDirectoryPeople(
        ctx,
        tx,
        (await peopleAmong(ctx, tx, ownAccounts, integrationUser)).map((account) =>
          directoryPerson(account, photos),
        ),
        cause,
      )
    : await directory.findEmployeeIdsByEmail(
        ctx,
        tx,
        ownAccounts.map(({ values }) => values.email),
      );
  await apps.syncAccounts(ctx, tx, {
    findingKind: connector.findingKinds.ownAppAccounts,
    connectionId: connection.id,
    accounts: ownAccounts.map((account) => foundAccount(account, connection.appId, employeeIds)),
    cause,
    readStartedAt,
  });
  const { otherAppAccounts } = connector.findingKinds;
  if (otherAppAccounts) {
    const otherAccounts = accounts.filter(({ values }) => values.appExternalId !== null);
    await syncOtherAppAccounts(ctx, tx, apps, {
      findingKind: otherAppAccounts,
      connectionId: connection.id,
      accounts: otherAccounts,
      employeeIds,
      cause,
      readStartedAt,
    });
  }
}

/** The directory's accounts that are people: all but the integration user's, known by its id. */
async function peopleAmong(
  ctx: SecurityContext,
  tx: Tx,
  directoryAccounts: readonly ImportedAccount[],
  integrationUser: IntegrationUser,
): Promise<readonly ImportedAccount[]> {
  const integrationUserId = await integrationUser.readGoogleUserId(ctx, tx);
  return directoryAccounts.filter(({ sourceKey }) => sourceKey !== integrationUserId);
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
    cause,
    readStartedAt,
  }: {
    findingKind: string;
    connectionId: string;
    accounts: readonly ImportedAccount[];
    employeeIds: Map<string, string>;
    cause: HistoryAppend["cause"];
    readStartedAt: Date;
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
    connectionId,
    accounts: accounts.map((account) =>
      foundAccount(account, appIds.get(account.values.appExternalId!)!, employeeIds),
    ),
    cause,
    readStartedAt,
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
