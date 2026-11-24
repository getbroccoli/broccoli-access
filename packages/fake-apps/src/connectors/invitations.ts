import type { Invitation } from "@broccoli-access/connector-contract";

import type { SeedMember } from "../seed";
import type { ConnectorsState, PendingInvitation } from "./connectorsState";
import { defaultRoleOf, type FakeConnector } from "./fakeConnector";

/** What an invite found: the email's member, or its invitation and whether it was just sent. */
type InviteResult = { member: SeedMember } | { invitation: PendingInvitation; sent: boolean };

/**
 * Invites the email as the app does, with the default role when none is given, unless it already
 * has a member or an invitation.
 */
export function invite(
  connector: FakeConnector,
  state: ConnectorsState,
  { email, role = defaultRoleOf(connector) }: { email: string; role?: string },
): InviteResult {
  const key = connector.description.key;
  const member = state.members[key].find((each) => each.email === email);
  if (member !== undefined) return { member };
  const pending = state.invitations[key].find((each) => each.email === email);
  if (pending !== undefined) return { invitation: pending, sent: false };
  const invitation = { email, ...connector.invitationDates(new Date()), role };
  state.invitations[key].push(invitation);
  return { invitation, sent: true };
}

/**
 * Turns the email's invitation into an active member with its role and a new id; nothing
 * without one.
 */
export function acceptInvitation(
  connector: FakeConnector,
  state: ConnectorsState,
  email: string,
): SeedMember | undefined {
  const invitation = removeInvitation(connector, state, email);
  if (invitation === undefined) return undefined;
  const key = connector.description.key;
  const member: SeedMember = {
    sourceKey: connector.workspace.memberId(state.joinedCounts[key]++),
    email,
    displayName: "",
    status: "active",
    role: invitation.role,
    isConnectionUser: false,
  };
  state.members[key].push(member);
  return member;
}

/** Removes the email's invitation, as when it expires; nothing without one. */
export function removeInvitation(
  connector: FakeConnector,
  state: ConnectorsState,
  email: string,
): PendingInvitation | undefined {
  const invitations = state.invitations[connector.description.key];
  const index = invitations.findIndex((each) => each.email === email);
  return index === -1 ? undefined : invitations.splice(index, 1)[0];
}

/** The invitation as the contract's wire carries it. */
export function withoutRole({ email, invitedAt, expiresAt }: PendingInvitation): Invitation {
  return { email, invitedAt, expiresAt };
}
