import { expect, it } from "vitest";

import { CONNECTOR_MANIFEST, type ConnectorRole } from "./connectorManifest.js";

it("parses the documented manifest", () => {
  expect(CONNECTOR_MANIFEST.parse(manifest)).toEqual(manifest);
});

it.for(["suspend", "reactivate"])("rejects %s without its paired capability", (capability) => {
  const connector = { ...manifest.connectors[0], capabilities: ["list_accounts", capability] };

  const result = CONNECTOR_MANIFEST.safeParse({ connectors: [connector] });

  expect(result.error?.issues).toContainEqual(
    expect.objectContaining({
      path: ["connectors", 0, "capabilities"],
      message: "suspend and reactivate must be listed together",
    }),
  );
});

it("leaves out a capability v1 does not list", () => {
  const extended = structuredClone(manifest);
  extended.connectors[0]!.capabilities.push("delete_accounts");

  const parsed = CONNECTOR_MANIFEST.parse(extended);

  expect(parsed.connectors[0]!.capabilities).toEqual(["list_accounts", "suspend", "reactivate"]);
});

it("keeps the invite, list_invitations, remove and sign_in capabilities", () => {
  const extended = structuredClone(manifest);
  extended.connectors[0]!.capabilities.push("invite", "list_invitations", "remove", "sign_in");

  expect(CONNECTOR_MANIFEST.parse(extended)).toEqual(extended);
});

it("keeps the default and admin Slack roles", () => {
  const withRoles = { connectors: [{ ...manifest.connectors[0], roles: slackRoles }] };

  expect(CONNECTOR_MANIFEST.parse(withRoles)).toEqual(withRoles);
});

it.for([
  { reason: "two defaults", roles: [true, true] },
  { reason: "no default", roles: [false, false] },
  { reason: "an empty role list", roles: [] },
])("rejects a manifest with $reason", ({ roles }) => {
  const description = {
    ...manifest.connectors[0],
    roles: roles.map((isDefault, i) => ({ ...slackRoles[i], isDefault })),
  };

  expect(CONNECTOR_MANIFEST.safeParse({ connectors: [description] }).success).toBe(false);
});

it.for(["key", "name"])("rejects a role with an empty %s", (field) => {
  const roles = [{ ...slackRoles[0], [field]: "" }];

  expect(
    CONNECTOR_MANIFEST.safeParse({ connectors: [{ ...manifest.connectors[0], roles }] }).success,
  ).toBe(false);
});

it("rejects the robot runtime", () => {
  const invalid = structuredClone(manifest);
  invalid.connectors[0]!.runtimes = ["robot"];

  expect(CONNECTOR_MANIFEST.safeParse(invalid).success).toBe(false);
});

it("rejects an app session field without domains", () => {
  const invalid = structuredClone(manifest);
  Reflect.deleteProperty(invalid.connectors[0]!.connectionFields[0]!, "domains");

  expect(CONNECTOR_MANIFEST.safeParse(invalid).success).toBe(false);
});

it("rejects a text field without secret", () => {
  const description = {
    ...manifest.connectors[0],
    connectionFields: [
      { key: "apiKey", kind: "text", label: "Linear API key", help: "Paste your key." },
    ],
  };

  expect(CONNECTOR_MANIFEST.safeParse({ connectors: [description] }).success).toBe(false);
});

const manifest = {
  connectors: [
    {
      key: "slack",
      version: 1,
      name: "Slack",
      appDomain: "slack.com",
      runtimes: ["server"],
      capabilities: ["list_accounts", "suspend", "reactivate"],
      findingKind: "slack_members",
      connectionFields: [
        {
          key: "appSession",
          kind: "app_session",
          label: "Slack admin session",
          help: "Sign in to Slack in Chrome as a Workspace Admin, then connect.",
          domains: ["slack.com"],
          storageKeys: ["localConfig_v2"],
        },
      ],
      notice:
        "Slack's terms may not allow automated access to its pages. broccoli-access acts only when you ask, in your own name, and stops at any check Slack shows.",
      adminUrl: "https://{teamDomain}.slack.com/admin",
    },
  ],
};

const slackRoles: ConnectorRole[] = [
  { key: "member", name: "Member", isDefault: true },
  { key: "admin", name: "Admin", isDefault: false },
];
