import { ApplicationError } from "../../../core/applicationError";
import {
  canInvite,
  type Connector,
  listsInvitations,
  offersInviteRole,
} from "../../../core/connectors";
import type { Orm, Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { parseUuid } from "../../../utils";
import {
  type AppConnection,
  type AppInvitation,
  accountChangeRepository,
  appAccountRepository,
  appConnectionRepository,
  appInvitationRepository,
  appRepository,
} from "../db";
import { type AccountChange, type AppInviteState, inviteStateOf } from "../domain";
import {
  type AccountChangeDependencies,
  type LatestAccountChange,
  RUN_JOB,
  withPlace,
} from "./accountChangeService";
import { findEmployeesInDirectory } from "./directory";

/** An employee's row for an app they have no account in: Invite, its running invite, Invited, or Couldn't invite. */
export interface AppInvite extends AppInviteState {
  /** The employee's and the app's ids, joined; unique per employee and app. */
  id: string;
  employeeId: string;
  appId: string;
  /** Its newest invite, with its place in its connection's queue while it runs; null before the first. */
  latestInvite: LatestAccountChange | null;
}

/**
 * Writes the employee's running invite to the app and queues its run in the connection's group, in
 * one transaction, refusing what is not offered; returns the employee's row with it.
 */
export async function inviteEmployee(
  dependencies: AccountChangeDependencies,
  ctx: SecurityContext,
  { employeeId, appId }: { employeeId: string; appId: string },
): Promise<AppInvite> {
  ctx.require("MANAGE_WORKSPACE");
  if (!ctx.user) {
    throw new ApplicationError("FORBIDDEN", "Only a signed-in user can ask for an invite.");
  }
  const requestedBy = ctx.user.userId;
  const [employee] = parseUuid(employeeId)
    ? await dependencies.employees.readEmployees(ctx, [employeeId])
    : [];
  if (!employee) {
    throw new ApplicationError("NOT_FOUND", "No employee has this id.");
  }
  // Read before the transaction: the container's list may take a while to answer.
  const connectors = await dependencies.connectors.list();
  const request = { employee, appId, requestedBy, connectors };
  const invite = await queueInvite(dependencies, request);
  const { id: changeId, connectionId } = invite.latestInvite!;
  dependencies.logger.info({ changeId, employeeId, connectionId }, "Invite requested");
  return invite;
}

/** The employees' rows for the connected apps they have no account in, by employee, then app name. */
export async function readAppInvites(
  dependencies: AccountChangeDependencies,
  ctx: SecurityContext,
  employeeIds: readonly string[],
  db = dependencies.orm,
): Promise<AppInvite[]> {
  ctx.require("MANAGE_WORKSPACE");
  const employees = await dependencies.employees.readEmployees(ctx, employeeIds, db);
  const [connectors, connections] = await Promise.all([
    dependencies.connectors.list(),
    appConnectionRepository(db).findAll(),
  ]);
  const facts = await readInviteFacts(dependencies, db, { employees, connections, connectors });
  const byAppName = await sortByAppName(db, connections);
  const rows = employees.flatMap((employee) =>
    byAppName.flatMap((connection) => appInviteOf(employee, connection, facts) ?? []),
  );
  const running = rows.flatMap(({ latestInvite }) =>
    latestInvite?.status === "running" ? [latestInvite.id] : [],
  );
  const ahead = await accountChangeRepository(db).countChangesAhead(running);
  return rows.map((row) => ({
    ...row,
    latestInvite: row.latestInvite && withPlace(row.latestInvite, ahead),
  }));
}

const NOT_OFFERED = "Invite is not offered for this employee in this app now.";

/** An employee the caller may read, with the email an invite goes to. */
interface InvitedEmployee {
  id: string;
  email: string;
}

interface InviteRequest {
  employee: InvitedEmployee;
  appId: string;
  requestedBy: string;
  connectors: readonly Connector[];
}

/** Wait for a template edit outside the account sync lock, then recheck all invite facts. */
async function queueInvite(
  deps: AccountChangeDependencies,
  request: InviteRequest,
): Promise<AppInvite> {
  for (;;) {
    const invite = await deps.transact((tx) => askForInvite(deps, tx, request));
    if (invite) return invite;
    await deps.transact((tx) => appRepository(tx).lockForReview([request.appId]));
  }
}

/** Writes and queues the invite, or returns null if a template edit holds its app. */
async function askForInvite(
  dependencies: AccountChangeDependencies,
  tx: Tx,
  { employee, appId, requestedBy, connectors }: InviteRequest,
): Promise<AppInvite | null> {
  await appAccountRepository(tx).lockForSync();
  const connection = await findConnectionOfApp(tx, appId);
  if (!(await appRepository(tx).tryLockForReview(connection.appId))) return null;
  const facts = await readInviteFacts(dependencies, tx, {
    employees: [employee],
    connections: [connection],
    connectors,
  });
  if (!appInviteOf(employee, connection, facts)?.offered) {
    throw new ApplicationError("CONFLICT", NOT_OFFERED);
  }
  const role = await dependencies.readInviteRole(tx, employee.id, appId);
  const connector = connectors.find(({ key }) => key === connection.connector);
  if (!offersInviteRole(connector?.roles, role)) {
    throw new ApplicationError("CONFLICT", "The app no longer offers this role.");
  }
  const changes = accountChangeRepository(tx);
  const change = await changes.insertRunning({
    appAccountId: null,
    appId,
    email: employee.email,
    connectionId: connection.id,
    action: "invite",
    role,
    sourceKey: null,
    requestedBy,
    requestedAt: new Date(),
  });
  // A concurrent invite of the same email committed first.
  if (!change) {
    throw new ApplicationError("CONFLICT", NOT_OFFERED);
  }
  await dependencies.jobs.send(tx, RUN_JOB, { changeId: change.id }, { group: connection.id });
  const latestInvites = new Map([[inviteKey(connection.id, employee.email), change]]);
  // A row with an invite always shows.
  const row = appInviteOf(employee, connection, { ...facts, latestInvites })!;
  return { ...row, latestInvite: withPlace(change, await changes.countChangesAhead([change.id])) };
}

/** The app's connection; refuses an unknown app with NOT_FOUND, and one without a connection with CONFLICT. */
async function findConnectionOfApp(tx: Tx, appId: string): Promise<AppConnection> {
  const app = parseUuid(appId) && (await appRepository(tx).findById(appId));
  if (!app) {
    throw new ApplicationError("NOT_FOUND", "No app has this id.");
  }
  const [connection] = await appConnectionRepository(tx).findByApps([app.id]);
  if (!connection) {
    throw new ApplicationError("CONFLICT", NOT_OFFERED);
  }
  return connection;
}

/**
 * What the rows are decided from: who is active in the directory, the scans' members and pending
 * invitations, the latest invites.
 */
interface StoredInviteFacts {
  activeInDirectory: Set<string>;
  /** When each connection's last scan finished, by connection id. */
  scannedAt: Map<string, Date>;
  /** The keys (`inviteKey`) of the members the connections' last scans saw. */
  memberKeys: Set<string>;
  /** The pending invitations the connections' last scans read, by key (`inviteKey`). */
  invitations: Map<string, AppInvitation>;
  /** By key (`inviteKey`). */
  latestInvites: Map<string, AccountChange>;
  invitingConnectors: Set<string>;
  /** The keys of the connectors whose scans read the pending invitations. */
  invitationListingConnectors: Set<string>;
}

async function readInviteFacts(
  { members }: AccountChangeDependencies,
  db: Orm | Tx,
  {
    employees,
    connections,
    connectors,
  }: {
    employees: readonly InvitedEmployee[];
    connections: readonly AppConnection[];
    connectors: readonly Connector[];
  },
): Promise<StoredInviteFacts> {
  const connectionIds = connections.map(({ id }) => id);
  const emails = employees.map(({ email }) => email);
  const [active, lastScans, memberKeys, pending, latest] = await Promise.all([
    findEmployeesInDirectory(db, connectors, {
      status: "active",
      among: employees.map(({ id }) => id),
    }),
    members.findLastScans(db),
    readMemberKeys(db, members, employees, connections),
    appInvitationRepository(db).findByEmails({ connectionIds, emails }),
    accountChangeRepository(db).findLatestInvites(connectionIds, emails),
  ]);
  return {
    activeInDirectory: new Set(active),
    scannedAt: new Map(lastScans.map(({ connectionId, scannedAt }) => [connectionId, scannedAt])),
    memberKeys,
    invitations: new Map(
      pending.map((invitation) => [
        inviteKey(invitation.connectionId, invitation.email),
        invitation,
      ]),
    ),
    latestInvites: new Map(
      latest.map((change) => [inviteKey(change.connectionId, change.email), change]),
    ),
    invitingConnectors: new Set(connectors.filter(canInvite).map(({ key }) => key)),
    invitationListingConnectors: new Set(connectors.filter(listsInvitations).map(({ key }) => key)),
  };
}

/** Keys the scanned members by the employee's work email, including a member the owner linked. */
async function readMemberKeys(
  db: Orm | Tx,
  members: AccountChangeDependencies["members"],
  employees: readonly InvitedEmployee[],
  connections: readonly AppConnection[],
) {
  const links = await appAccountRepository(db).findOwnerLinks(
    employees.map(({ id }) => id),
    connections.map(({ appId }) => appId),
  );
  const emails = [...new Set([...employees, ...links].map(({ email }) => email))];
  const found = await members.findConnectionMembers(db, {
    connectionIds: connections.map(({ id }) => id),
    emails,
  });
  const memberKeys = new Set(
    found.map(({ connectionId, email }) => inviteKey(connectionId, email)),
  );
  const connectionOfApp = new Map(connections.map(({ appId, id }) => [appId, id]));
  const workEmails = new Map(employees.map(({ id, email }) => [id, email]));
  const linkedKeys = links.flatMap((link) => {
    const connectionId = connectionOfApp.get(link.appId);
    return connectionId && memberKeys.has(inviteKey(connectionId, link.email))
      ? [inviteKey(connectionId, workEmails.get(link.employeeId)!)]
      : [];
  });
  return new Set([...memberKeys, ...linkedKeys]);
}

/** The employee's row for the connection's app, its latest invite not yet placed; null when none shows. */
function appInviteOf(
  employee: InvitedEmployee,
  connection: AppConnection,
  facts: StoredInviteFacts,
): AppInvite | null {
  const key = inviteKey(connection.id, employee.email);
  const latestInvite = facts.latestInvites.get(key) ?? null;
  const state = inviteStateOf({
    activeInDirectory: facts.activeInDirectory.has(employee.id),
    connection: {
      status: connection.status,
      invites: facts.invitingConnectors.has(connection.connector),
      listsInvitations: facts.invitationListingConnectors.has(connection.connector),
      scannedAt: facts.scannedAt.get(connection.id) ?? null,
    },
    hasMember: facts.memberKeys.has(key),
    invitation: facts.invitations.get(key) ?? null,
    latestInvite,
  });
  return (
    state && {
      id: `${employee.id}:${connection.appId}`,
      employeeId: employee.id,
      appId: connection.appId,
      ...state,
      latestInvite: latestInvite && { ...latestInvite, changesAhead: null },
    }
  );
}

async function sortByAppName(
  db: Orm,
  connections: readonly AppConnection[],
): Promise<AppConnection[]> {
  const apps = await appRepository(db).findByIds(connections.map(({ appId }) => appId));
  const names = new Map(apps.map(({ id, name }) => [id, name]));
  return connections.toSorted((one, other) =>
    names.get(one.appId)!.localeCompare(names.get(other.appId)!),
  );
}

function inviteKey(connectionId: string, email: string): string {
  return `${connectionId} ${email}`;
}
