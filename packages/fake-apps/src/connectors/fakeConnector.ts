import type { ConnectorDescription, Invitation } from "@broccoli-access/connector-contract";

import type { SeedMember, SeedWorkspace } from "../seed";
import type { ConnectorsState, FakeConnectorKey } from "./connectorsState";

/** One app the fake answers for, as the real container's connector would on the wire. */
export interface FakeConnector {
  /** Its entry in the manifest, whose key also names it in calls, controls and state. */
  description: ConnectorDescription & { key: FakeConnectorKey };
  workspace: SeedWorkspace;
  /** The setting that names the workspace, which list and action calls check. */
  workspaceIdSetting: string;
  /** The workspace's address a connection test answers, such as `acme.slack.com`; null for an app without one. */
  workspaceDomain: string | null;
  /** Whether the connection's secrets still reach the workspace. */
  authenticates: (state: ConnectorsState, secrets: Record<string, unknown>) => boolean;
  /** The member as the app's own API shows it. */
  raw: (member: SeedMember) => Record<string, unknown>;
  /** The dates the app gives an invitation sent at `sentAt`; null where it gives none. */
  invitationDates: (sentAt: Date) => Pick<Invitation, "invitedAt" | "expiresAt">;
}
