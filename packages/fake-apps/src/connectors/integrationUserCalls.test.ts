import {
  APP_SESSION,
  CONNECTION_SIGN_IN_ANSWER,
  type Connection,
  type ConnectionSignInAnswer,
  type ConnectionSignInRequest,
  type IntegrationUserSetupAnswer,
  type IntegrationUserSetupRequest,
} from "@broccoli-access/connector-contract";
import { expect } from "vitest";

import {
  callConnector,
  control,
  integrationUser,
  inviteSlackAdmin,
  listSlackPages,
  memberAccount,
  readState,
  slackOwnerRequest,
  test as it,
  testWithCreatedGoogleUser as withGoogle,
} from "#test/support";
import { ACME_SLACK, INTEGRATION_USER_TOTP_SECRET } from "../seed";

withGoogle(
  "sets up a user the directory created and returns the same secret on retry",
  async ({ connectors: { url } }) => {
    const expected: IntegrationUserSetupAnswer = { totpSecret: INTEGRATION_USER_TOTP_SECRET };
    const first = await callConnector(url, "integration-user/setup", setupRequest);
    expect(first).toEqual({ status: 200, body: expected });

    const retry = await callConnector(url, "integration-user/setup", { integrationUser });
    expect(retry).toEqual(first);
  },
);

withGoogle(
  "refuses setup for an email the directory did not create",
  async ({ connectors: { url } }) => {
    const user = { ...setupRequest.integrationUser, email: "unknown@acme.example" };

    const result = await callConnector(url, "integration-user/setup", { integrationUser: user });

    expect(result).toEqual(authenticationFailed);
  },
);

it("refuses setup without a directory", async ({ connectors: { url } }) => {
  const result = await callConnector(url, "integration-user/setup", setupRequest);

  expect(result).toEqual(authenticationFailed);
});

withGoogle("refuses setup with the wrong two-step secret", async ({ connectors: { url } }) => {
  const result = await callConnector(url, "integration-user/setup", {
    integrationUser: { ...integrationUser, totpSecret: "wrong-secret" },
  });

  expect(result).toEqual(authenticationFailed);
});

withGoogle("keeps the password from the first accepted setup", async ({ connectors: { url } }) => {
  await setupUser(url);

  const result = await callConnector(url, "integration-user/setup", {
    integrationUser: { ...integrationUser, password: "another-password" },
  });

  expect(result).toEqual(authenticationFailed);
});

withGoogle(
  "uses a planned setup failure once without a connector key",
  async ({ connectors: { url } }) => {
    await control(url, "/failures", {
      call: "integration-user/setup",
      code: "blocked_by_check",
      count: 1,
    });

    const result = await callConnector(url, "integration-user/setup", setupRequest);

    expect(result).toEqual({ status: 200, body: { error: { code: "blocked_by_check" } } });
    await setupUser(url);
  },
);

it.for(["integration-user/setup", "connections/sign-in"] as const)(
  "rejects a malformed %s request",
  async (call, { connectors: { url } }) => {
    expect((await callConnector(url, call, {})).status).toBe(400);
  },
);

it.for(["linear", "unknown"])(
  "rejects sign-in for %s",
  async (connector, { connectors: { url } }) => {
    const result = await callConnector(url, "connections/sign-in", { ...signInRequest, connector });

    expect(result.status).toBe(400);
  },
);

it("requires a Slack member or invitation for sign-in", async ({ connectors: { url } }) => {
  const result = await signIn(url);

  expect(result).toEqual({ status: 200, body: { error: { code: "not_invited" } } });
});

it.for(["wrong-secret", null])(
  "refuses Slack sign-in with two-step secret %s",
  async (totpSecret, { connectors: { url } }) => {
    await inviteSlackAdmin(url);

    const result = await callConnector(url, "connections/sign-in", {
      ...signInRequest,
      integrationUser: { ...integrationUser, totpSecret },
    });

    expect(result).toEqual(authenticationFailed);
  },
);

withGoogle(
  "refuses sign-in with a different password from setup",
  async ({ connectors: { url } }) => {
    await setupUser(url);
    await inviteSlackAdmin(url);

    const result = await callConnector(url, "connections/sign-in", {
      ...signInRequest,
      integrationUser: { ...integrationUser, password: "another-password" },
    });

    expect(result).toEqual(authenticationFailed);
    expect((await signIn(url)).body).toMatchObject({ details: { organizationName: "Acme" } });
  },
);

it("accepts the Slack admin invitation and returns the workspace and session", async ({
  connectors: { url },
}) => {
  await inviteSlackAdmin(url);

  const result = await signIn(url);

  expect(result.status).toBe(200);
  const { details, connection }: ConnectionSignInAnswer = CONNECTION_SIGN_IN_ANSWER.parse(
    result.body,
  );
  expect(details).toEqual({ organizationName: "Acme", domain: "acme.slack.com" });
  expect(connection.settings).toEqual(ACME_SLACK.settings);
  expect(APP_SESSION.safeParse(connection.secrets.appSession).success).toBe(true);
  const state = await readState(url);
  expect(state.invitations.slack.map(({ email }) => email)).not.toContain(integrationUser.email);
  expect(state.slack).toContainEqual(
    expect.objectContaining({ email: integrationUser.email, role: "admin", status: "active" }),
  );
});

it("accepts a member invitation but requires promotion to admin before sign-in succeeds", async ({
  connectors: { url },
}) => {
  const { email } = integrationUser;
  await control(url, "/slack/invitations", { email });

  const result = await signIn(url);

  expect(result).toEqual({ status: 200, body: { error: { code: "permission_missing" } } });
  const state = await readState(url);
  expect(state.invitations.slack.map((invite) => invite.email)).not.toContain(email);
  expect(state.slack).toContainEqual(
    expect.objectContaining({ email, role: "member", status: "active" }),
  );
  await control(url, `/slack/members/${email}/role`, { role: "admin" });
  expect((await signIn(url)).body).toMatchObject({ details: { organizationName: "Acme" } });
});

it("marks only the signed-in member as the connection user on every Slack page", async ({
  connectors: { url },
}) => {
  const request = await signInAsAdmin(url);
  const owner = await slackOwnerRequest(url);

  for (const [connection, email] of [
    [request.connection, integrationUser.email],
    [owner.connection, "admin@acme.example"],
  ] as const) {
    const pages = await listSlackPages(url, connection);
    const members = pages.flatMap((page) => page.accounts.map(({ values }) => values));
    expect(members.map((member) => member.email)).toEqual(
      expect.arrayContaining([integrationUser.email, "admin@acme.example"]),
    );
    expect(
      members.filter((member) => member.isConnectionUser).map((member) => member.email),
    ).toEqual([email]);
  }
});

it("attributes Slack changes to the member who made them", async ({ connectors: { url } }) => {
  const request = await signInAsAdmin(url);
  const account = memberAccount(ACME_SLACK, "ana@acme.example");

  await callConnector(url, "actions/run", { ...request, action: "suspend", account });

  expect((await readState(url)).changes.slack).toEqual([
    { action: "invite", email: integrationUser.email, madeBy: "admin@acme.example" },
    { action: "suspend", email: account.email, madeBy: integrationUser.email },
  ]);
});

it("protects the integration user's own member from removal", async ({ connectors: { url } }) => {
  const request = await signInAsAdmin(url);
  const { email, sourceKey } = (await readState(url)).slack.find(
    (member) => member.email === integrationUser.email,
  )!;

  const result = await callConnector(url, "actions/run", {
    ...request,
    action: "remove",
    account: { email, sourceKey },
  });

  expect(result.body).toEqual({ error: { code: "not_allowed" } });
  expect((await readState(url)).slack).toContainEqual(
    expect.objectContaining({ email, sourceKey }),
  );
});

it("renews an expired Slack connection by signing back into its workspace", async ({
  connectors: { url },
}) => {
  const request = await signInAsAdmin(url);
  expect((await callConnector(url, "connections/test", request)).body).toMatchObject({
    details: slackDetails,
  });
  await control(url, "/slack/sessions/expire");
  expect(await callConnector(url, "connections/test", request)).toEqual(authenticationFailed);

  const renewed = await signIn(url, request.connection);

  const { connection } = CONNECTION_SIGN_IN_ANSWER.parse(renewed.body);
  expect(
    (await callConnector(url, "connections/test", { ...request, connection })).body,
  ).toMatchObject({ details: slackDetails });
});

it("refuses to renew a stored connection for a different Slack workspace", async ({
  connectors: { url },
}) => {
  const { connection } = await signInAsAdmin(url);

  const result = await signIn(url, {
    ...connection,
    settings: { ...connection.settings, teamId: "T04OTHER" },
  });

  expect(result).toEqual({ status: 200, body: { error: { code: "wrong_workspace" } } });
});

it.for(["blocked_by_check", "not_invited"])(
  "uses a planned %s sign-in failure once",
  async (code, { connectors: { url } }) => {
    await inviteSlackAdmin(url);
    await control(url, "/failures", {
      connector: "slack",
      call: "connections/sign-in",
      code,
      count: 1,
    });

    const result = await signIn(url);

    expect(result).toEqual({ status: 200, body: { error: { code } } });
    expect((await signIn(url)).body).toMatchObject({ details: slackDetails });
  },
);

const setupRequest: IntegrationUserSetupRequest = {
  integrationUser: { ...integrationUser, totpSecret: null },
};
const signInRequest: ConnectionSignInRequest = {
  connector: "slack",
  integrationUser,
  connection: null,
};
const slackDetails = { organizationName: "Acme", domain: "acme.slack.com" };
const authenticationFailed = { status: 200, body: { error: { code: "authentication_failed" } } };

async function setupUser(url: string) {
  expect(await callConnector(url, "integration-user/setup", setupRequest)).toEqual({
    status: 200,
    body: { totpSecret: INTEGRATION_USER_TOTP_SECRET },
  });
}

function signIn(url: string, connection: Connection | null = null) {
  return callConnector(url, "connections/sign-in", { ...signInRequest, connection });
}

async function signInAsAdmin(url: string) {
  await inviteSlackAdmin(url);
  const { connection } = CONNECTION_SIGN_IN_ANSWER.parse((await signIn(url)).body);
  return { connector: "slack", runtime: { kind: "server" }, connection };
}
