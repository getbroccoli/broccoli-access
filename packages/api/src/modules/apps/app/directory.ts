import { ApplicationError } from "../../../core/applicationError";
import type { AccountStatus, Connector } from "../../../core/connectors";
import type { Orm, Tx } from "../../../core/db";
import { appAccountRepository, appConnectionRepository, directoryChangeRepository } from "../db";
import type { AccountChangeDependencies } from "./accountChangeService";

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
  return (await findDirectoryConnection(db, connectors))?.appId ?? null;
}

/** The directory's connection, if the owner has connected it. */
export async function findDirectoryConnection(db: Orm | Tx, connectors: DirectoryConnectors) {
  const directory = connectors.find(({ isDirectory }) => isDirectory);
  return directory ? appConnectionRepository(db).findByConnector(directory.key) : null;
}

/** Employees with a directory account, filtered by status or employee id when given. */
export async function findEmployeesInDirectory(
  db: Orm | Tx,
  connectors: DirectoryConnectors,
  { status, among }: { status?: AccountStatus; among?: readonly string[] } = {},
): Promise<string[]> {
  const appId = await findDirectoryAppId(db, connectors);
  return appId
    ? appAccountRepository(db).findEmployeeIdsWithStatus(appId, status ?? null, among)
    : [];
}

/** Whether this person has an active directory account, using the directory's membership index. */
export async function activeInDirectory(db: Orm | Tx, connectors: DirectoryConnectors, id: string) {
  const active = await findEmployeesInDirectory(db, connectors, { status: "active", among: [id] });
  return active.length > 0;
}

export async function requireDirectoryMatchForOffboarding(
  { findPeopleAwaitingDirectory }: Pick<AccountChangeDependencies, "findPeopleAwaitingDirectory">,
  tx: Tx,
  employeeId: string,
) {
  if ((await findPeopleAwaitingDirectory(tx, [employeeId])).has(employeeId)) {
    throw new ApplicationError(
      "CONFLICT",
      "This person can be offboarded after the directory scan finds them.",
    );
  }
}

/** An active account, or a successful creation for this address that the directory has yet to list. */
export async function findEmployeesReadyForInvites(
  db: Orm | Tx,
  {
    directoryConnectors,
    findPeopleAwaitingDirectory,
    members,
  }: Pick<
    AccountChangeDependencies,
    "directoryConnectors" | "findPeopleAwaitingDirectory" | "members"
  >,
  employees: readonly { id: string; email: string }[],
): Promise<Set<string>> {
  const directory = await findDirectoryConnection(db, directoryConnectors);
  if (!directory || !employees.length) return new Set();
  const accounts = appAccountRepository(db);
  const active = new Set(
    await accounts.findEmployeeIdsWithStatus(
      directory.appId,
      "active",
      employees.map(({ id }) => id),
    ),
  );
  const awaiting = await findPeopleAwaitingDirectory(
    db,
    employees.flatMap(({ id }) => (active.has(id) ? [] : [id])),
  );
  if (!awaiting.size) return active;
  const ids = [...awaiting];
  const [invites, suspended, scans] = await Promise.all([
    directoryChangeRepository(db).findLatest(ids, directory.id),
    accounts.findEmployeeIdsWithStatus(directory.appId, "suspended", ids),
    members.findLastScans(db),
  ]);
  const scannedAt = scans.find(({ connectionId }) => connectionId === directory.id)?.scannedAt;
  const suspendedIds = new Set(suspended);
  for (const { id, email } of employees) {
    const invite = invites.get(id);
    if (
      invite?.status === "succeeded" &&
      invite.email === email &&
      invite.finishedAt &&
      (!scannedAt || invite.finishedAt > scannedAt) &&
      !suspendedIds.has(id)
    )
      active.add(id);
  }
  return active;
}
