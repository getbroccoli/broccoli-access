import type { AccountChange } from "./accountChange";

/** What decides an employee's invite row in one connected app. */
export interface AppInviteFacts {
  /** Whether the employee's account in the directory is active. */
  activeInDirectory: boolean;
  connection: {
    status: "connected" | "reconnect";
    /** Whether its connector lists `invite`. */
    invites: boolean;
    /** Whether it has finished a scan. */
    scanned: boolean;
  };
  /** Whether the connection's last scan returned a member with the employee's email. */
  hasMember: boolean;
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
 * The row of an app whose connection invites and whose last finished scan found no member with the
 * employee's email: Invite for an employee active in the directory, unless an invite runs or they
 * are Invited, which a `succeeded` or `done_by_hand` latest invite makes them, dated by its finish;
 * Reconnect instead while the connection needs it. Null when no row shows: the connection cannot
 * tell or invite, the employee has a member, or nothing is offered and nothing was ever asked.
 * shortcut: Invited stays after a member the invite brought leaves the app, since only the latest
 * invite dates it; read the scan's invitations instead once scans list them.
 */
export function inviteStateOf({
  activeInDirectory,
  connection,
  hasMember,
  latestInvite,
}: AppInviteFacts): AppInviteState | null {
  if (!connection.invites || !connection.scanned || hasMember) {
    return null;
  }
  const invitedAt = invitedAtOf(latestInvite);
  const invitable = activeInDirectory && !invitedAt && latestInvite?.status !== "running";
  if (!invitable && !latestInvite) {
    return null;
  }
  const connected = connection.status === "connected";
  return {
    offered: invitable && connected,
    offersReconnect: invitable && !connected,
    invitedAt,
  };
}

function invitedAtOf(latestInvite: AppInviteFacts["latestInvite"]): Date | null {
  const done = latestInvite?.status === "succeeded" || latestInvite?.status === "done_by_hand";
  return done ? latestInvite.finishedAt : null;
}
