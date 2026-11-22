import { ACCOUNTS_LIST_ANSWER } from "@broccoli-access/connector-contract";
import { expect } from "vitest";

import {
  callConnector,
  linearRequest,
  memberAccount,
  signInToFakeSlack,
  test as it,
} from "#test/support";
import { ACME_LINEAR, ACME_SLACK } from "../seed";

it("lists the Slack and Linear connectors in order with their connection fields", async ({
  connectors: { url },
}) => {
  const response = await fetch(`${url}/v1/connectors`);

  expect(await response.json()).toEqual({ connectors: [slackDescription, linearDescription] });
});

it.for(["connections/test", "accounts/list", "actions/run"] as const)(
  "rejects the owner browser runtime on %s",
  async (call, { connectors: { url } }) => {
    const request = {
      ...linearRequest,
      runtime: { kind: "owner_browser", url: "ws://localhost/owner-browser/test" },
      ...(call === "accounts/list" && { cursor: null }),
      ...(call === "actions/run" && {
        action: "suspend",
        account: memberAccount(ACME_LINEAR, "chloe@acme.example"),
      }),
    };

    const result = await callConnector(url, call, request);

    expect(result.status).toBe(400);
  },
);

it("rejects an unknown connector key", async ({ connectors: { url } }) => {
  const result = await callConnector(url, "connections/test", {
    ...linearRequest,
    connector: "unknown",
  });

  expect(result.status).toBe(400);
});

it("suspends Chloé in Linear and lists her as suspended", async ({ connectors: { url } }) => {
  const account = memberAccount(ACME_LINEAR, "chloe@acme.example");

  const result = await callConnector(url, "actions/run", {
    ...linearRequest,
    action: "suspend",
    account,
  });

  const values = {
    email: account.email,
    status: "suspended",
    displayName: "Chloé Martin",
    isConnectionUser: false,
  };
  expect(result.body).toMatchObject({
    changed: true,
    account: { sourceKey: account.sourceKey, values },
  });
  const list = await callConnector(url, "accounts/list", { ...linearRequest, cursor: null });
  const listed = ACCOUNTS_LIST_ANSWER.parse(list.body).accounts.find(
    ({ sourceKey }) => sourceKey === account.sourceKey,
  );
  expect(listed?.values).toEqual(values);
});

it("keeps Chloé suspended when the action is repeated", async ({ connectors: { url } }) => {
  const request = {
    ...linearRequest,
    action: "suspend",
    account: memberAccount(ACME_LINEAR, "chloe@acme.example"),
  };
  await callConnector(url, "actions/run", request);

  const result = await callConnector(url, "actions/run", request);

  expect(result.body).toMatchObject({
    changed: false,
    account: { sourceKey: request.account.sourceKey, values: { status: "suspended" } },
  });
});

it("reactivates Chloé after suspending her", async ({ connectors: { url } }) => {
  const account = memberAccount(ACME_LINEAR, "chloe@acme.example");
  await callConnector(url, "actions/run", { ...linearRequest, action: "suspend", account });

  const result = await callConnector(url, "actions/run", {
    ...linearRequest,
    action: "reactivate",
    account,
  });

  expect(result.body).toMatchObject({
    changed: true,
    account: { sourceKey: account.sourceKey, values: { status: "active" } },
  });
});

it("reactivates Elif in Slack", async ({ connectors: { url } }) => {
  const appSession = await signInToFakeSlack(url);
  const account = memberAccount(ACME_SLACK, "elif@acme.example");

  const result = await callConnector(url, "actions/run", {
    connector: "slack",
    runtime: { kind: "server" },
    connection: { settings: ACME_SLACK.settings, secrets: { appSession } },
    action: "reactivate",
    account,
  });

  expect(result.body).toMatchObject({
    changed: true,
    account: { sourceKey: account.sourceKey, values: { status: "active" } },
  });
});

it("answers account_not_found for an unknown source key", async ({ connectors: { url } }) => {
  const account = { sourceKey: "unknown", email: "chloe@acme.example" };

  const result = await callConnector(url, "actions/run", {
    ...linearRequest,
    action: "suspend",
    account,
  });

  expect(result.body).toEqual({ error: { code: "account_not_found" } });
});

it("answers account_not_found for Chloé's source key with Ana's email", async ({
  connectors: { url },
}) => {
  const chloe = memberAccount(ACME_LINEAR, "chloe@acme.example");
  const account = { sourceKey: chloe.sourceKey, email: "ana@acme.example" };

  const result = await callConnector(url, "actions/run", {
    ...linearRequest,
    action: "suspend",
    account,
  });

  expect(result.body).toEqual({ error: { code: "account_not_found" } });
});

it("answers account_not_found for a pending invitation", async ({ connectors: { url } }) => {
  const { sourceKey, email } = ACME_LINEAR.members.find((member) => member.status === "invited")!;

  const result = await callConnector(url, "actions/run", {
    ...linearRequest,
    action: "suspend",
    account: { sourceKey, email },
  });

  expect(result.body).toEqual({ error: { code: "account_not_found" } });
});

it("answers wrong_workspace for another Linear organisation ID", async ({
  connectors: { url },
}) => {
  const connection = {
    ...linearRequest.connection,
    settings: { ...ACME_LINEAR.settings, organizationId: "b1db9401-79d2-49f2-9bad-be38636e63aa" },
  };

  const result = await callConnector(url, "accounts/list", {
    ...linearRequest,
    connection,
    cursor: null,
  });

  expect(result.body).toEqual({ error: { code: "wrong_workspace" } });
});

const linearDescription = {
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
};

const slackDescription = {
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
      domains: ["slack.localhost"],
      storageKeys: ["localConfig_v2"],
    },
  ],
  notice:
    "Slack's terms may not allow automated access to its pages. broccoli-access acts only when you ask, in your own name, and stops at any check Slack shows.",
  adminUrl: "https://{teamDomain}.slack.com/admin",
};
