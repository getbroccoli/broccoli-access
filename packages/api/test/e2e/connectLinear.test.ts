import { ACME_LINEAR } from "@broccoli-access/fake-apps";
import { onTestFinished } from "vitest";

import {
  expect,
  test as baseTest,
  connectorTest as test,
  finishSetupWithPreselectedApps,
  LINEAR_INPUT,
  TestEnv,
} from "#test/support";

test("the owner connects Linear and reads its seven members with their status", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const list = await browser.graphql(
    "{ containerConnectors { id connectionFields { kind } connection { id } } }",
  );
  const listed = (await list.json()) as { data: { containerConnectors: { id: string }[] } };
  expect(listed).not.toHaveProperty("errors");
  expect(listed.data.containerConnectors.toSorted((a, b) => a.id.localeCompare(b.id))).toEqual([
    { id: "linear", connectionFields: [{ kind: "TEXT" }], connection: null },
    { id: "slack", connectionFields: [{ kind: "APP_SESSION" }], connection: null },
  ]);

  await finishSetupWithPreselectedApps(browser);
  const response = await browser.graphql(CONNECT, { input: LINEAR_INPUT });

  const connected = (await response.json()) as {
    data: { connectors: { connect: { containerConnector: { connection: { id: string } } } } };
  };
  expect(connected).toMatchObject({
    data: {
      connectors: {
        connect: {
          containerConnector: { id: "linear", connection: { id: expect.any(String) as unknown } },
          error: null,
        },
      },
    },
  });
  const connectionId = connected.data.connectors.connect.containerConnector.connection.id;
  const approved = await browser.graphql(
    "{ apps(status: APPROVED) { edges { node { id catalogKey } } } }",
  );
  const body = (await approved.json()) as {
    data: { apps: { edges: { node: { id: string; catalogKey: string | null } }[] } };
  };
  const app = body.data.apps.edges.find(({ node }) => node.catalogKey === "linear")!.node;
  const expectedUsers = ACME_LINEAR.members.map((member) => ({
    employee: { email: member.email },
    status: member.status.toUpperCase(),
  }));
  await expect
    .poll(
      async () => {
        const result = await browser.graphql(
          `query ($id: ID!) { app(id: $id) {
      users { employee { email } status }
      containerConnection { id adminUrl connector { id findingKind } scan { sourceName } connectionUserEmail }
    } }`,
          { id: app.id },
        );
        const page = (await result.json()) as { data: { app: { users: unknown[] } } };
        if ("errors" in page) return page;
        expect(page.data.app.users).toHaveLength(7);
        return page;
      },
      { timeout: 60_000, interval: 250 },
    )
    .toEqual({
      data: {
        app: {
          users: expect.arrayContaining(expectedUsers) as unknown,
          containerConnection: {
            id: connectionId,
            connector: { id: "linear", findingKind: "linear_members" },
            adminUrl: "https://linear.app/acme/settings/members",
            scan: { sourceName: "Acme" },
            connectionUserEmail: "admin@acme.example",
          },
        },
      },
    });
}, 90_000);

test("reconnects Linear over GraphQL and returns the connected status", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  await finishSetupWithPreselectedApps(browser);
  const response = await browser.graphql(CONNECT, { input: LINEAR_INPUT });
  const connected = (await response.json()) as {
    data: { connectors: { connect: { containerConnector: { connection: { id: string } } } } };
  };
  await env.seed.connectionNeedsReconnect(
    connected.data.connectors.connect.containerConnector.connection.id,
  );

  const result = await browser.graphql(
    `mutation ($input: ContainerConnectorReconnectInput!) {
      connectors { reconnect(input: $input) {
        containerConnector { id connection { status } }
        error { __typename }
      } }
    }`,
    { input: LINEAR_INPUT },
  );

  expect(await result.json()).toEqual({
    data: {
      connectors: {
        reconnect: {
          containerConnector: { id: "linear", connection: { status: "CONNECTED" } },
          error: null,
        },
      },
    },
  });
}, 90_000);

test("Applications offers Linear to connect, then shows it connected", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  await finishSetupWithPreselectedApps(browser);

  const before = await browser.graphql(APPLICATIONS);
  expect(await before.json()).toEqual({
    data: {
      appsToConnect: [
        {
          id: "linear",
          name: "Linear",
          domain: "linear.app",
          connector: { id: "linear", connection: null },
        },
      ],
      apps: {
        edges: expect.arrayContaining([
          { node: { catalogKey: "slack", managingConnector: { id: "slack", connection: null } } },
          { node: { catalogKey: "google_workspace", managingConnector: null } },
        ]) as unknown,
      },
    },
  });

  const connected = await browser.graphql(CONNECT, { input: LINEAR_INPUT });
  expect(await connected.json()).toMatchObject({
    data: { connectors: { connect: { containerConnector: { id: "linear" }, error: null } } },
  });

  const after = await browser.graphql(APPLICATIONS);
  expect(await after.json()).toEqual({
    data: {
      appsToConnect: [],
      apps: {
        edges: expect.arrayContaining([
          {
            node: {
              catalogKey: "linear",
              managingConnector: {
                id: "linear",
                connection: { id: expect.any(String) as unknown },
              },
            },
          },
        ]) as unknown,
      },
    },
  });
}, 90_000);

test("listing apps to connect requires a session", async ({ env }) => {
  const response = await env.browser().graphql("{ appsToConnect { id } }");

  expect(await response.json()).toMatchObject({
    errors: [{ extensions: { code: "UNAUTHENTICATED" } }],
  });
});

test("a refused Linear key comes back as an invalid input payload", async ({ env }) => {
  const { browser } = await env.signInAsOwner();

  const response = await browser.graphql(CONNECT, {
    input: { connector: "linear", values: [{ key: "apiKey", value: "refused" }] },
  });

  expect(await response.json()).toEqual({
    data: {
      connectors: {
        connect: {
          containerConnector: null,
          error: {
            __typename: "InvalidInputError",
            fields: [{ field: "values", code: "authentication_failed" }],
          },
        },
      },
    },
  });
});

test("connecting Linear requires a session", async ({ env }) => {
  const response = await env.browser().graphql(CONNECT, { input: LINEAR_INPUT });

  expect(await response.json()).toMatchObject({
    errors: [{ extensions: { code: "UNAUTHENTICATED" } }],
  });
});

baseTest(
  "the server starts and lists no connectors when the container is unavailable",
  async ({ fakeGoogle }) => {
    const env = await TestEnv.start({
      googleUrl: fakeGoogle.url,
      connectorsUrl: "http://127.0.0.1:0",
    });
    onTestFinished(() => env.stop());
    const { browser } = await env.signInAsOwner();

    const response = await browser.graphql("{ containerConnectors { id } }");

    expect(await response.json()).toEqual({ data: { containerConnectors: [] } });
  },
);

const APPLICATIONS = `{
  appsToConnect { id name domain connector { id connection { id } } }
  apps(status: APPROVED) { edges { node { catalogKey managingConnector { id connection { id } } } } }
}`;

const CONNECT = `mutation ($input: ContainerConnectorConnectInput!) {
  connectors { connect(input: $input) {
    containerConnector { id connection { id } }
    error { __typename ... on InvalidInputError { fields { field code } } }
  } }
}`;
