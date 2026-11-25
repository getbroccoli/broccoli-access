import {
  ACCOUNT_CHANGE_POLL,
  type Browser,
  changeAccount,
  connectorTest,
  consentAtGoogle,
  expect,
  finishSetupWithPreselectedApps,
  INTEGRATION_USER_EMAIL,
  inviteIntegrationUserToFakeSlack,
  type TestEnv,
} from "#test/support";

connectorTest(
  "the owner connects Slack with the integration user, and a Disable runs as it",
  async ({ env, fakeConnectors }) => {
    const browser = await ownerWithIntegrationUser(env);
    await inviteIntegrationUserToFakeSlack(fakeConnectors, "admin");

    const connected = await browser.graphql(CONNECT, { input: SLACK });

    expect(await connected.json()).toEqual({
      data: {
        connectors: {
          connectWithIntegrationUser: {
            containerConnector: {
              id: "slack",
              signsInAsIntegrationUser: true,
              connection: { sessionFrom: "SERVER_SIGN_IN" },
            },
            error: null,
          },
        },
      },
    });
    await expect
      .poll(() => slackUser(browser, "ana@acme.example"), ACCOUNT_CHANGE_POLL)
      .toMatchObject({ offeredChange: "SUSPEND" });
    const ana = await slackUser(browser, "ana@acme.example");
    await changeAccount(browser, ana!.id, "SUSPEND");
    await expect
      .poll(async () => {
        const state = await fetch(new URL("/_fake/state", fakeConnectors.url));
        return ((await state.json()) as { changes: { slack: unknown[] } }).changes.slack;
      }, ACCOUNT_CHANGE_POLL)
      .toContainEqual({
        action: "suspend",
        email: "ana@acme.example",
        madeBy: INTEGRATION_USER_EMAIL,
      });
  },
  90_000,
);

connectorTest(
  "an integration user Slack has not invited comes back as an invalid input payload",
  async ({ env }) => {
    const browser = await ownerWithIntegrationUser(env);

    const refused = await browser.graphql(CONNECT, { input: SLACK });

    expect(await refused.json()).toEqual({
      data: {
        connectors: {
          connectWithIntegrationUser: {
            containerConnector: null,
            error: {
              __typename: "InvalidInputError",
              fields: [{ field: "integrationUser", code: "not_invited" }],
            },
          },
        },
      },
    });
  },
  90_000,
);

connectorTest("connecting with the integration user requires a session", async ({ env }) => {
  const response = await env.browser().graphql(CONNECT, { input: SLACK });

  expect(await response.json()).toMatchObject({
    errors: [{ extensions: { code: "UNAUTHENTICATED" } }],
  });
});

const SLACK = { connector: "slack", noticeAccepted: true };

const CONNECT = `mutation ($input: ContainerConnectorConnectWithIntegrationUserInput!) {
  connectors { connectWithIntegrationUser(input: $input) {
    containerConnector { id signsInAsIntegrationUser connection { sessionFrom } }
    error { __typename ... on InvalidInputError { fields { field code } } }
  } }
}`;

/** The owner, past setup, with an integration user that signs in to Google with two steps. */
async function ownerWithIntegrationUser(env: TestEnv): Promise<Browser> {
  const { browser } = await env.signInAsOwner();
  await finishSetupWithPreselectedApps(browser);
  const started = await browser.post("/api/google/integration-user", {
    email: INTEGRATION_USER_EMAIL,
  });
  const { authorizationUrl } = (await started.json()) as { authorizationUrl: string };
  const callback = await consentAtGoogle(authorizationUrl);
  expect((await browser.getManual(callback.href)).status).toBe(302);
  await expect
    .poll(async () => {
      const settings = await browser.graphql("{ setup { integrationUser { signInStatus } } }");
      return settings.json();
    }, ACCOUNT_CHANGE_POLL)
    .toEqual({
      data: { setup: { integrationUser: { signInStatus: "SIGNS_IN_WITH_TWO_STEP_SIGN_IN" } } },
    });
  return browser;
}

/** Slack's user with `email`, offered Disable once its connection's scan read the members. */
async function slackUser(browser: Browser, email: string) {
  const response = await browser.graphql(
    `{ apps(status: APPROVED) { edges { node { catalogKey users { id offeredChange employee { email } } } } } }`,
  );
  const body = (await response.json()) as {
    data: {
      apps: {
        edges: {
          node: {
            catalogKey: string | null;
            users: { id: string; offeredChange: string | null; employee: { email: string } }[];
          };
        }[];
      };
    };
  };
  const slack = body.data.apps.edges.find(({ node }) => node.catalogKey === "slack");
  return slack?.node.users.find(({ employee }) => employee.email === email);
}
