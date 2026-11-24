import type {
  AccountAction,
  ConnectorCall,
  ConnectorErrorCode,
  IntegrationUserCall,
  Invitation,
} from "@broccoli-access/connector-contract";

import type { SeedMember } from "../seed";
import { defaultRoleOf, type FakeConnector } from "./fakeConnector";
import { LINEAR } from "./linear";
import { SLACK } from "./slack";

/** What every part of the fake connectors container shares while it runs. */
export interface FakeConnectorsContext {
  /** Replaced by a fresh seeded state on reset. */
  state: ConnectorsState;
  reset: () => void;
  /** Writes one log line: connector keys, calls, actions and error codes only (contract "Logs"). */
  log: (line: string) => void;
  /** The fake Google that knows which users were created; without it, no integration user is set up. */
  googleUrl: string | undefined;
}

/** The fake's memory: Acme's members and invitations in each app, and what the controls changed. */
export interface ConnectorsState {
  members: Record<FakeConnectorKey, SeedMember[]>;
  invitations: Record<FakeConnectorKey, PendingInvitation[]>;
  /** The changes actions made in each workspace, oldest first. */
  changes: Record<FakeConnectorKey, MadeChange[]>;
  /** How many members each workspace ever had: a removed member's id is never given again. */
  joinedCounts: Record<FakeConnectorKey, number>;
  /** Planned failures by `failureKeyOf`; each matching call uses one. */
  failures: Map<string, PlannedFailure>;
  /** How long each call's answer takes. */
  delayMs: number;
  /** Each Slack session the fake issued, by its `d` cookie. */
  slackSessions: Map<string, SlackSession>;
  linearKeyRevoked: boolean;
  /** The password each integration user was set up with, by email. */
  integrationUserPasswords: Map<string, string>;
}

export type FakeConnectorKey = "slack" | "linear";

/** A pending invitation with the role its member will get, which the contract's wire leaves out. */
export type PendingInvitation = Invitation & { role: string };

export interface MadeChange {
  action: AccountAction;
  /** The member or invitee it changed. */
  email: string;
  /** The member whose session or key made it. */
  madeBy: string;
}

export interface PlannedFailure {
  code: ConnectorErrorCode;
  remaining: number;
}

export interface SlackSession {
  /** The token Slack's page keeps in local storage. */
  token: string;
  /** The `sourceKey` of the member who signed in. */
  memberKey: string;
}

/** The seed's members and invitations, copied so changes never reach the seed. */
export function seededState(delayMs: number): ConnectorsState {
  return {
    members: ofEachWorkspace(({ workspace }) => workspace.members.map((member) => ({ ...member }))),
    invitations: ofEachWorkspace((connector) =>
      connector.workspace.invitations.map((email) => seededInvitation(connector, email)),
    ),
    changes: ofEachWorkspace(() => []),
    joinedCounts: ofEachWorkspace(({ workspace }) => workspace.members.length),
    failures: new Map(),
    delayMs,
    slackSessions: new Map(),
    linearKeyRevoked: false,
    integrationUserPasswords: new Map(),
  };
}

/** `integration-user/setup` has no connector, so its failures are planned by the call alone. */
export function failureKeyOf(
  call: ConnectorCall | IntegrationUserCall,
  connector: FakeConnectorKey | undefined,
): string {
  return connector === undefined ? call : `${connector} ${call}`;
}

function ofEachWorkspace<T>(seeded: (connector: FakeConnector) => T): Record<FakeConnectorKey, T> {
  return { slack: seeded(SLACK), linear: seeded(LINEAR) };
}

/** The seed's invitations carry no dates, so two fakes started apart list them alike. */
function seededInvitation(connector: FakeConnector, email: string): PendingInvitation {
  return { email, invitedAt: null, expiresAt: null, role: defaultRoleOf(connector) };
}
