import { onTestFinished } from "vitest";

import {
  expect,
  test,
  pairChrome,
  TestEnv,
  signInToFakeSlack,
  finishSetupWithPreselectedApps,
} from "#test/support";

test("the owner connects Slack with the session the paired Chrome hands over", async ({
  fakeGoogle,
  fakeConnectors,
}) => {
  const env = await TestEnv.start({ googleUrl: fakeGoogle.url, connectorsUrl: fakeConnectors.url });
  onTestFinished(() => env.stop());
  const { token, browser } = await pairChrome(env);
  await finishSetupWithPreselectedApps(browser);
  const url = new URL("/api/extension/app-sessions/slack", env.url);
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const description = await fetch(url, { headers });
  expect(description.status).toBe(200);
  expect(await description.json()).toEqual({
    connector: "slack",
    name: "Slack",
    domains: ["slack.localhost"],
    storageKeys: ["localConfig_v2"],
  });
  const id = "settings-request";
  const posted = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ requestId: id, appSession: await signInToFakeSlack(fakeConnectors) }),
  });
  expect(posted.status).toBe(204);
  const response = await browser.graphql(
    "query ($id: ID!) { appSessionHandOver(id: $id) { id organizationName domain appSession } }",
    { id },
  );
  const body = (await response.json()) as { data: { appSessionHandOver: { appSession: string } } };
  expect(body).toEqual({
    data: {
      appSessionHandOver: {
        id,
        organizationName: "Acme",
        domain: "acme.slack.com",
        appSession: expect.stringMatching(/\S/) as unknown,
      },
    },
  });

  const connected = await browser.graphql(CONNECT, {
    input: {
      connector: "slack",
      noticeAccepted: true,
      appSession: body.data.appSessionHandOver.appSession,
    },
  });

  expect(await connected.json()).toEqual({
    data: {
      connectors: {
        connect: {
          containerConnector: {
            id: "slack",
            connection: { noticeAcceptedAt: expect.any(String) as unknown },
          },
          error: null,
        },
      },
    },
  });
  const approved = await browser.graphql(
    "{ apps(status: APPROVED) { edges { node { catalogKey } } } }",
  );
  const apps = (await approved.json()) as {
    data: { apps: { edges: { node: { catalogKey: string | null } }[] } };
  };
  expect(apps.data.apps.edges).toContainEqual({ node: { catalogKey: "slack" } });
});

test.for(["GET", "POST"])(
  "refuses %s for Slack without an extension token",
  async (method, { env }) => {
    const response = await fetch(new URL("/api/extension/app-sessions/slack", env.url), { method });
    expect(response.status).toBe(401);
  },
);

test.for(["GET", "POST"])(
  "refuses %s for Slack with the wrong extension token",
  async (method, { env }) => {
    const response = await fetch(new URL("/api/extension/app-sessions/slack", env.url), {
      method,
      headers: { authorization: "Bearer unknown" },
    });
    expect(response.status).toBe(401);
  },
);

const CONNECT = `mutation ($input: ContainerConnectorConnectInput!) {
  connectors { connect(input: $input) {
    containerConnector { id connection { noticeAcceptedAt } }
    error { __typename }
  } }
}`;
