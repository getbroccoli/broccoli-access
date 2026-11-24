import { ApplicationError } from "../../../core/applicationError";
import { canInvite, type Connector } from "../../../core/connectors";
import type { Orm, Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { parseUuid } from "../../../utils";
import {
  type AppConnection,
  accountChangeRepository,
  appConnectionRepository,
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
  const invite = await dependencies.transact((tx) =>
    askForInvite(dependencies, tx, { employee, appId, requestedBy, connectors }),
  );
  const { id: changeId, connectionId } = invite.latestInvite!;
  dependencies.logger.info({ changeId, employeeId, connectionId }, "Invite requested");
  return invite;
}

/** The employees' rows for the connected apps they have no account in, by employee, then app name. */
export async function readAppInvites(
  dependencies: AccountChangeDependencies,
  ctx: SecurityContext,
  employeeIds: readonly string[],
): Promise<AppInvite[]> {
  ctx.require("MANAGE_WORKSPACE");
  const { orm } = dependencies;
  const employees = await dependencies.employees.readEmployees(ctx, employeeIds);
  const [connectors, connections] = await Promise.all([
    dependencies.connectors.list(),
    appConnectionRepository(orm).findAll(),
  ]);
  const facts = await readInviteFacts(dependencies, orm, { employees, connections, connectors });
  const byAppName = await sortByAppName(orm, connections);
  const rows = employees.flatMap((employee) =>
    byAppName.flatMap((connection) => appInviteOf(employee, connection, facts) ?? []),
  );
  const running = rows.flatMap(({ latestInvite }) =>
    latestInvite?.status === "running" ? [latestInvite.id] : [],
  );
  const ahead = await accountChangeRepository(orm).countChangesAhead(running);
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

/** Writes the running invite and queues its run, refusing an unknown app and what is not offered. */
async function askForInvite(
  dependencies: AccountChangeDependencies,
  tx: Tx,
  {
    employee,
    appId,
    requestedBy,
    connectors,
  }: {
    employee: InvitedEmployee;
    appId: string;
    requestedBy: string;
    connectors: readonly Connector[];
  },
): Promise<AppInvite> {
  const connection = await findConnectionOfApp(tx, appId);
  const facts = await readInviteFacts(dependencies, tx, {
    employees: [employee],
    connections: [connection],
    connectors,
  });
  if (!appInviteOf(employee, connection, facts)?.offered) {
    throw new ApplicationError("CONFLICT", NOT_OFFERED);
  }
  const changes = accountChangeRepository(tx);
  const change = await changes.insertRunning({
    appAccountId: null,
    appId,
    email: employee.email,
    connectionId: connection.id,
    action: "invite",
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

/** What the rows are decided from: who is active in the directory, the scans' members, the latest invites. */
interface StoredInviteFacts {
  activeInDirectory: Set<string>;
  scannedConnectionIds: Set<string>;
  /** The keys (`inviteKey`) of the members the connections' last scans saw. */
  memberKeys: Set<string>;
  /** By key (`inviteKey`). */
  latestInvites: Map<string, AccountChange>;
  invitingConnectors: Set<string>;
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
  const [active, scanned, found, latest] = await Promise.all([
    findEmployeesInDirectory(db, connectors, {
      status: "active",
      among: employees.map(({ id }) => id),
    }),
    members.findScannedConnectionIds(db),
    members.findConnectionMembers(db, { connectionIds, emails }),
    accountChangeRepository(db).findLatestInvites(connectionIds, emails),
  ]);
  return {
    activeInDirectory: new Set(active),
    scannedConnectionIds: new Set(scanned),
    memberKeys: new Set(found.map(({ connectionId, email }) => inviteKey(connectionId, email))),
    latestInvites: new Map(
      latest.map((change) => [inviteKey(change.connectionId, change.email), change]),
    ),
    invitingConnectors: new Set(connectors.filter(canInvite).map(({ key }) => key)),
  };
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
      scanned: facts.scannedConnectionIds.has(connection.id),
    },
    hasMember: facts.memberKeys.has(key),
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
