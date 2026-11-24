import type {
  ConnectorCall,
  ConnectorErrorCode,
  Invitation,
} from "@broccoli-access/connector-contract";

import { ACME_LINEAR, ACME_SLACK, type SeedMember } from "../seed";

/** What every part of the fake connectors container shares while it runs. */
export interface FakeConnectorsContext {
  /** Replaced by a fresh seeded state on reset. */
  state: ConnectorsState;
  reset: () => void;
  /** Writes one log line: connector keys, calls, actions and error codes only (contract "Logs"). */
  log: (line: string) => void;
}

/** The fake's memory: Acme's members and pending invitations in each app, and what the controls changed. */
export interface ConnectorsState {
  members: Record<FakeConnectorKey, SeedMember[]>;
  invitations: Record<FakeConnectorKey, Invitation[]>;
  /** Planned failures by connector and call; each matching call uses one. */
  failures: Map<`${FakeConnectorKey} ${ConnectorCall}`, PlannedFailure>;
  /** How long each call's answer takes. */
  delayMs: number;
  /** The `d` cookie of each Slack session the fake issued, with its page token. */
  slackSessions: Map<string, string>;
  linearKeyRevoked: boolean;
}

export type FakeConnectorKey = "slack" | "linear";

export interface PlannedFailure {
  code: ConnectorErrorCode;
  remaining: number;
}

/** The seed's members and invitations, copied so changes never reach the seed. */
export function seededState(delayMs: number): ConnectorsState {
  return {
    members: {
      slack: ACME_SLACK.members.map((member) => ({ ...member })),
      linear: ACME_LINEAR.members.map((member) => ({ ...member })),
    },
    invitations: {
      slack: ACME_SLACK.invitations.map(undatedInvitation),
      linear: ACME_LINEAR.invitations.map(undatedInvitation),
    },
    failures: new Map(),
    delayMs,
    slackSessions: new Map(),
    linearKeyRevoked: false,
  };
}

/** The seed's invitations carry no dates, so two fakes started apart list them alike. */
function undatedInvitation(email: string): Invitation {
  return { email, invitedAt: null, expiresAt: null };
}
