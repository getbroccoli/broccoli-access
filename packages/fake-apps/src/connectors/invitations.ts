import type { Invitation } from "@broccoli-access/connector-contract";

import type { SeedMember } from "../seed";
import type { ConnectorsState } from "./connectorsState";
import type { FakeConnector } from "./fakeConnector";

/** What an invite found: the email's member, or its pending invitation and whether it was just sent. */
export type InviteResult = { member: SeedMember } | { invitation: Invitation; sent: boolean };

/** Invites the email as the app does: an email with a member or a pending invitation gets no second one. */
export function invite(
  connector: FakeConnector,
  state: ConnectorsState,
  email: string,
): InviteResult {
  const key = connector.description.key;
  const member = state.members[key].find((each) => each.email === email);
  if (member !== undefined) return { member };
  const pending = state.invitations[key].find((each) => each.email === email);
  if (pending !== undefined) return { invitation: pending, sent: false };
  const invitation = { email, ...connector.invitationDates(new Date()) };
  state.invitations[key].push(invitation);
  return { invitation, sent: true };
}

/** Turns the email's invitation into an active member with a new id; false without one. */
export function acceptInvitation(
  connector: FakeConnector,
  state: ConnectorsState,
  email: string,
): boolean {
  if (!removeInvitation(connector, state, email)) return false;
  const members = state.members[connector.description.key];
  // Members are never removed, so their count gives the next unused id.
  const sourceKey = connector.workspace.memberId(members.length);
  members.push({ sourceKey, email, displayName: "", status: "active", isConnectionUser: false });
  return true;
}

/** Removes the email's invitation, as when it expires; false without one. */
export function removeInvitation(
  connector: FakeConnector,
  state: ConnectorsState,
  email: string,
): boolean {
  const invitations = state.invitations[connector.description.key];
  const index = invitations.findIndex((each) => each.email === email);
  if (index === -1) return false;
  invitations.splice(index, 1);
  return true;
}
