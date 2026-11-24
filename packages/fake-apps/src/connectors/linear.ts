import { ACME_LINEAR, ADMIN_ROLE } from "../seed";
import type { FakeConnector } from "./fakeConnector";

/** Linear through its API: the seed's key reaches Acme until the key revoke control. */
export const LINEAR: FakeConnector = {
  description: {
    key: "linear",
    version: 1,
    name: "Linear",
    appDomain: "linear.app",
    runtimes: ["server"],
    capabilities: [
      "list_accounts",
      "suspend",
      "reactivate",
      "invite",
      "list_invitations",
      "remove",
    ],
    roles: [
      { key: "user", name: "User", isDefault: true },
      { key: ADMIN_ROLE, name: "Admin", isDefault: false },
      { key: "guest", name: "Guest", isDefault: false },
    ],
    findingKind: "linear_members",
    connectionFields: [
      {
        key: "apiKey",
        kind: "text",
        label: "Personal API key",
        help: "In Linear, signed in as an admin, open Settings → Security & access, click New API key under Personal API keys, give it full access and paste it here.",
        secret: true,
      },
    ],
    notice: null,
    adminUrl: "https://linear.app/{urlKey}/settings/members",
  },
  workspace: ACME_LINEAR,
  workspaceIdSetting: "organizationId",
  workspaceDomain: null,
  connectionMember: (state, secrets) =>
    state.linearKeyRevoked || secrets.apiKey !== ACME_LINEAR.apiKey
      ? undefined
      : state.members.linear.find((member) => member.sourceKey === KEY_OWNER_ID),
  raw: (member) => ({
    id: member.sourceKey,
    name: member.displayName,
    email: member.email,
    active: member.status === "active",
    admin: member.role === ADMIN_ROLE,
    guest: member.role === "guest",
  }),
  invitationDates: (sentAt) => ({
    invitedAt: sentAt.toISOString(),
    expiresAt: new Date(sentAt.getTime() + INVITATION_LIFETIME_MS).toISOString(),
  }),
};

/** Mia Novak, whose personal API key the seed's is. */
const KEY_OWNER_ID = ACME_LINEAR.members.find((member) => member.isConnectionUser)?.sourceKey;

/** Linear's invitations expire 30 days after they are sent. */
const INVITATION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
