import { canInvite, type Connector, listsInvitations } from "../../../core/connectors";
import type { Orm, Tx } from "../../../core/db";
import {
  accountChangeRepository,
  appAccountRepository,
  appInvitationRepository,
  type AppConnection,
  type AppInvitation,
} from "../db";
import { type AccountChange, inviteStateOf } from "../domain";
import type { AccountChangeDependencies } from "./accountChangeService";
import type { AppInvite } from "./appInvite";
import { findEmployeesInDirectory } from "./directory";

/** An employee the caller may read, with the email an invite goes to. */
export interface InvitedEmployee {
  id: string;
  email: string;
}

export function expectedInviteRows(
  pairs: readonly { employeeId: string; appId: string }[],
  employees: readonly InvitedEmployee[],
  connections: readonly AppConnection[],
  facts: StoredInviteFacts,
) {
  const people = new Map(employees.map((employee) => [employee.id, employee]));
  const connectedApps = new Map(connections.map((connection) => [connection.appId, connection]));
  return pairs.flatMap(({ employeeId, appId }) => {
    const employee = people.get(employeeId);
    const app = connectedApps.get(appId);
    return employee && app ? (appInviteOf(employee, app, facts) ?? []) : [];
  });
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

export async function readInviteFacts(
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
      latest.map((change) => [inviteKey(change.connectionId!, change.email), change]),
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
export function appInviteOf(
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

export function inviteKey(connectionId: string, email: string): string {
  return `${connectionId} ${email}`;
}
