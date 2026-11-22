import { ACME_LINEAR } from "../seed";
import type { FakeConnector } from "./fakeConnector";

/** Linear through its API: the seed's key reaches Acme until the key revoke control. */
export const LINEAR: FakeConnector = {
  description: {
    key: "linear",
    version: 1,
    name: "Linear",
    appDomain: "linear.app",
    runtimes: ["server"],
    capabilities: ["list_accounts", "suspend", "reactivate"],
    findingKind: "linear_members",
    connectionFields: [
      {
        key: "apiKey",
        kind: "text",
        label: "Linear API key",
        help: "Paste a personal API key made by a Linear admin.",
        secret: true,
      },
    ],
    notice: null,
    adminUrl: "https://linear.app/{urlKey}/settings/members",
  },
  workspace: ACME_LINEAR,
  workspaceIdSetting: "organizationId",
  authenticates: (state, secrets) =>
    !state.linearKeyRevoked && secrets.apiKey === ACME_LINEAR.apiKey,
  raw: (member) => ({
    id: member.sourceKey,
    name: member.displayName,
    email: member.email,
    active: member.status === "active",
    admin: member.isConnectionUser,
  }),
};
