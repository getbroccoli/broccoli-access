import { ApplicationError } from "../../../core/applicationError";
import { type Connector, offersInviteRole } from "../../../core/connectors";
import type { Orm, Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { parseUuid } from "../../../utils";
import {
  type AppConnection,
  accountChangeRepository,
  appAccountRepository,
  appConnectionRepository,
  appRepository,
} from "../db";
import { type AppInviteState, type ChangeStart, FROM_ACCOUNT, startOfChange } from "../domain";
import {
  type AccountChangeDependencies,
  type LatestAccountChange,
  RUN_JOB,
  withPlace,
} from "./accountChangeService";
import { readByHandInvites } from "./byHandInvites";
import {
  appInviteOf,
  expectedInviteRows,
  type InvitedEmployee,
  inviteKey,
  readInviteFacts,
} from "./appInviteFacts";

/**
 * An employee's row for an app they have no account in: Invite, its running invite, Invited, or
 * Couldn't invite; in an app without a connection, the invite the owner makes by hand.
 */
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
  // Read before the transaction: the container's list may take a while to answer.
  const connectors = await dependencies.connectors.list();
  const request = { ctx, employeeId, appId, requestedBy, connectors, start: FROM_ACCOUNT };
  const invite = await queueInvite(dependencies, request);
  const { id: changeId, connectionId } = invite.latestInvite!;
  dependencies.logger.info({ changeId, employeeId, connectionId }, "Invite requested");
  return invite;
}

/**
 * The employees' rows for the connected apps they have no account in, and for the apps without a
 * connection where an invite is theirs to make by hand, by employee, then app name.
 */
export async function readAppInvites(
  dependencies: AccountChangeDependencies,
  ctx: SecurityContext,
  employeeIds: readonly string[],
  db: Orm | Tx = dependencies.orm,
  expected?: readonly { employeeId: string; appId: string }[],
): Promise<AppInvite[]> {
  ctx.require("MANAGE_WORKSPACE");
  if (expected?.length === 0) return [];
  const employees = await dependencies.employees.readEmployees(ctx, employeeIds, db);
  const repo = appConnectionRepository(db);
  const [connectors, connections] = await Promise.all([
    dependencies.connectors.list(),
    expected ? repo.findByApps([...new Set(expected.map(({ appId }) => appId))]) : repo.findAll(),
  ]);
  const facts = await readInviteFacts(dependencies, db, { employees, connections, connectors });
  const connected = expected
    ? expectedInviteRows(expected, employees, connections, facts)
    : employees.flatMap((employee) =>
        connections.flatMap((connection) => appInviteOf(employee, connection, facts) ?? []),
      );
  const byHand = await readByHandInvites(
    dependencies,
    db,
    employees.map(({ id }) => id),
    connections,
  );
  if (expected) return [...connected, ...byHand].filter(({ invitedAt }) => invitedAt !== null);
  const rows = await sortByAppName(db, employees, [...connected, ...byHand]);
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

export interface InviteRequest {
  ctx: SecurityContext;
  employeeId: string;
  appId: string;
  requestedBy: string;
  connectors: readonly Connector[];
  start: ChangeStart;
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
export async function askForInvite(
  dependencies: AccountChangeDependencies,
  tx: Tx,
  { ctx, employeeId, appId, requestedBy, connectors, start }: InviteRequest,
): Promise<AppInvite | null> {
  await appAccountRepository(tx).lockForSync();
  const connection = await findConnectionOfApp(tx, appId);
  if (!(await appRepository(tx).tryLockForReview(connection.appId))) return null;
  const id = parseUuid(employeeId);
  const [employee] = id ? await dependencies.employees.readEmployees(ctx, [id], tx) : [];
  if (!employee) throw new ApplicationError("NOT_FOUND", "No employee has this id.");
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
    ...startOfChange(
      { ...start, action: "invite", subjectEmployeeId: employee.id },
      facts.latestInvites.get(inviteKey(connection.id, employee.email)) ?? null,
    ),
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

async function sortByAppName(
  db: Orm | Tx,
  employees: readonly InvitedEmployee[],
  rows: readonly AppInvite[],
): Promise<AppInvite[]> {
  const apps = await appRepository(db).findByIds([...new Set(rows.map(({ appId }) => appId))]);
  const names = new Map(apps.map(({ id, name }) => [id, name]));
  const ranks = new Map(employees.map(({ id }, rank) => [id, rank]));
  return rows.toSorted(
    (one, other) =>
      ranks.get(one.employeeId)! - ranks.get(other.employeeId)! ||
      names.get(one.appId)!.localeCompare(names.get(other.appId)!),
  );
}
