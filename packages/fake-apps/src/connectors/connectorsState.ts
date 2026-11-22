import type { ConnectorCall, ConnectorErrorCode } from "@broccoli-access/connector-contract";

import { ACME_LINEAR, ACME_SLACK, type SeedMember } from "../seed";

/** What every part of the fake connectors container shares while it runs. */
export interface FakeConnectorsContext {
  /** Replaced by a fresh seeded state on reset. */
  state: ConnectorsState;
  reset: () => void;
  /** Writes one log line: connector keys, calls, actions and error codes only (contract "Logs"). */
  log: (line: string) => void;
}

/** The fake's memory: Acme's members in each app and what the controls changed. */
export interface ConnectorsState {
  members: Record<FakeConnectorKey, SeedMember[]>;
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

/** The seed's members, copied so changes never reach the seed. */
export function seededState(delayMs: number): ConnectorsState {
  return {
    members: {
      slack: ACME_SLACK.members.map((member) => ({ ...member })),
      linear: ACME_LINEAR.members.map((member) => ({ ...member })),
    },
    failures: new Map(),
    delayMs,
    slackSessions: new Map(),
    linearKeyRevoked: false,
  };
}

/** Members only: a pending invitation is not one. */
export function membersOf(state: ConnectorsState, connector: FakeConnectorKey): SeedMember[] {
  return state.members[connector].filter((member) => member.status !== "invited");
}
