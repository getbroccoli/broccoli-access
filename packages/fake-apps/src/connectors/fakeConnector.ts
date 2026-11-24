import type {
  ConnectionTestAnswer,
  ConnectorDescription,
  ConnectorRole,
  Invitation,
} from "@broccoli-access/connector-contract";

import type { SeedMember, SeedWorkspace } from "../seed";
import type { ConnectorsState, FakeConnectorKey } from "./connectorsState";

/** One app the fake answers for, as the real container's connector would on the wire. */
export interface FakeConnector {
  /** Its entry in the manifest, whose key also names it in calls, controls and state. */
  description: ConnectorDescription & { key: FakeConnectorKey; roles: ConnectorRole[] };
  workspace: SeedWorkspace;
  /** The setting that names the workspace, which list and action calls check. */
  workspaceIdSetting: string;
  /** The workspace's address a connection test answers, such as `acme.slack.com`; null for an app without one. */
  workspaceDomain: string | null;
  /** The member whose key or session the secrets are; none when they no longer reach the workspace. */
  connectionMember: (
    state: ConnectorsState,
    secrets: Record<string, unknown>,
  ) => SeedMember | undefined;
  /** The member as the app's own API shows it. */
  raw: (member: SeedMember) => Record<string, unknown>;
  /** The dates the app gives an invitation sent at `sentAt`; null where it gives none. */
  invitationDates: (sentAt: Date) => Pick<Invitation, "invitedAt" | "expiresAt">;
  /** The secrets of a new session of `member`; only a connector that lists `sign_in` has it. */
  startSession?: (state: ConnectorsState, member: SeedMember) => Record<string, unknown>;
}

/** The role an invite without one gives. */
export function defaultRoleOf(connector: FakeConnector): string {
  const role = connector.description.roles.find((each) => each.isDefault);
  if (role === undefined) throw new Error(`${connector.description.key} lists no default role`);
  return role.key;
}

export function listsRole(connector: FakeConnector, role: string): boolean {
  return connector.description.roles.some((each) => each.key === role);
}

/** What a connection test and a sign-in tell about the workspace. */
export function detailsOf(connector: FakeConnector): ConnectionTestAnswer["details"] {
  return { organizationName: connector.workspace.name, domain: connector.workspaceDomain };
}

/** Settings from an earlier test that name another workspace than the one the secrets reach. */
export function reachesOtherWorkspace(
  connector: FakeConnector,
  settings: Record<string, unknown>,
): boolean {
  const id = settings[connector.workspaceIdSetting];
  return id !== undefined && id !== connector.workspace.settings[connector.workspaceIdSetting];
}
