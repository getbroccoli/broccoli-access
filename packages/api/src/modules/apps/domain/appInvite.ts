import type { AccountChange } from "./accountChange";

/** What decides an employee's invite row in one connected app. */
export interface AppInviteFacts {
  /** Whether the employee's account in the directory is active. */
  activeInDirectory: boolean;
  connection: {
    status: "connected" | "reconnect";
    /** Whether its connector lists `invite`. */
    invites: boolean;
    /** Whether its connector lists `list_invitations`, so its scans read the pending invitations. */
    listsInvitations: boolean;
    /** When its last scan finished; null before the first. */
    scannedAt: Date | null;
  };
  /** Whether the connection's last scan returned a member with the employee's email. */
  hasMember: boolean;
  /** The pending invitation of the employee's email that the connection's last scan read; null without one. */
  invitation: { invitedAt: Date | null; firstSeenAt: Date } | null;
  /** The latest invite of the employee's email through the connection; null before the first. */
  latestInvite: Pick<AccountChange, "status" | "finishedAt"> | null;
}

/** What an employee's row shows for an app they have no account in. */
export interface AppInviteState {
  /** Whether Invite is offered now; after a failed invite, that is Try again. */
  offered: boolean;
  /** Whether Reconnect shows instead of Invite, while the connection needs it. */
  offersReconnect: boolean;
  /** When they were invited, while the row shows Invited; null otherwise. */
  invitedAt: Date | null;
}

/**
 * The row of an app whose connection's last finished scan found no member with the employee's
 * email. Where the connection invites: Invite for an employee active in the directory, unless an
 * invite runs or they are Invited (`invitedAtOf`); Reconnect instead while the connection needs
 * it. Where it cannot invite, the row shows only while they are Invited. Null when no row shows:
 * the connection cannot tell, the employee has a member, or nothing is offered, nothing was ever
 * asked and they are not Invited.
 */
export function inviteStateOf(facts: AppInviteFacts): AppInviteState | null {
  const { activeInDirectory, connection, hasMember, latestInvite } = facts;
  if (!connection.scannedAt || hasMember) {
    return null;
  }
  const invitedAt = invitedAtOf(facts);
  if (!connection.invites) {
    return invitedAt && { offered: false, offersReconnect: false, invitedAt };
  }
  const invitable = activeInDirectory && !invitedAt && latestInvite?.status !== "running";
  if (!invitable && !latestInvite && !invitedAt) {
    return null;
  }
  const connected = connection.status === "connected";
  return {
    offered: invitable && connected,
    offersReconnect: invitable && !connected,
    invitedAt,
  };
}

/**
 * Since when the employee is Invited; null when they are not. A connection whose scans read the
 * pending invitations dates it by the invitation its last scan read, as the app dates it, else
 * since a scan first saw it; or by an invite done since that scan, which could not read it yet.
 * Any other connection knows only its own invites: the latest one, once done.
 * shortcut: compares the invite's finish with the scan's finish, so Invite shows again until the
 * next scan for an invite that succeeded while a scan was between reading and saving, one done by
 * hand after a scan that followed its failure, and one older than the last scan made before scans
 * read invitations; a scan's read start and a confirmation time would close them if that matters.
 */
function invitedAtOf({ connection, invitation, latestInvite }: AppInviteFacts): Date | null {
  const done = latestInvite?.status === "succeeded" || latestInvite?.status === "done_by_hand";
  const doneAt = done ? latestInvite.finishedAt : null;
  if (!connection.listsInvitations) {
    return doneAt;
  }
  if (invitation) {
    return invitation.invitedAt ?? invitation.firstSeenAt;
  }
  return doneAt && connection.scannedAt && doneAt > connection.scannedAt ? doneAt : null;
}
