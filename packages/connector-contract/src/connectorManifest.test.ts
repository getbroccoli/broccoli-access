import { expect, it } from "vitest";

import { CONNECTOR_MANIFEST } from "./connectorManifest.js";

it("parses the documented manifest", () => {
  expect(CONNECTOR_MANIFEST.parse(manifest)).toEqual(manifest);
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
