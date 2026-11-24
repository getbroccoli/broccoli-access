import { connectedLinear, connectorTest, expect, test, scannedApps } from "#test/support";

connectorTest(
  "a second account stays in Linear's users without taking another avatar slot",
  async ({ env }) => {
    const { browser, appId } = await connectedLinear(env);
    const person = await env.seed.employee({ firstName: "Aaron", lastName: "Dale" });
    const work = await env.seed.appAccount({
      appId,
      employeeId: person.id,
      email: person.email,
      foundVia: ["linear_members"],
    });
    const personal = await env.seed.appAccount({
      appId,
      employeeId: person.id,
      employeeLinkedBy: "owner",
      foundVia: ["linear_members"],
    });

    const response = await browser.graphql(
      `query ($id: ID!) {
    app(id: $id) {
      users { id employee { id } }
      peoplePreview(first: 4) { id employee { id } }
    }
  }`,
      { id: appId },
    );

    type Row = { id: string; employee: { id: string } };
    const body = (await response.json()) as {
      data: { app: { users: Row[]; peoplePreview: Row[] } };
    };
    expect(body).not.toHaveProperty("errors");
    const { users, peoplePreview } = body.data.app;
    expect(
      users
        .filter(({ employee }) => employee.id === person.id)
        .map(({ id }) => id)
        .sort(),
    ).toEqual([work.id, personal.id].sort());
    expect(peoplePreview).toHaveLength(4);
    const people = peoplePreview.map(({ employee }) => employee.id);
    expect(people).toContain(person.id);
    expect(new Set(people).size).toBe(4);
  },
  90_000,
);

test("lists app catalog keys and the first four users beside the full people count", async ({
  env,
}) => {
  const { browser } = await env.signInAsOwner();
  await scannedApps(browser);

  const response = await browser.graphql(`{
    apps(status: DISCOVERED) {
      edges { node {
        name catalogKey peopleCount
        users(first: 4) { employee { firstName lastName email } }
      } }
    }
  }`);

  const body = (await response.json()) as {
    data: { apps: { edges: { node: { name: string; users: unknown[] } }[] } };
  };
  expect(body).not.toHaveProperty("errors");
  expect(body.data.apps.edges.find(({ node }) => node.name === "Slack")?.node).toEqual({
    name: "Slack",
    catalogKey: "slack",
    peopleCount: 41,
    users: [
      { employee: { firstName: "Ana", lastName: "Ruiz", email: "ana@acme.example" } },
      { employee: { firstName: "Ben", lastName: "Ito", email: "ben@acme.example" } },
      { employee: { firstName: "Aisha", lastName: "Khan", email: "aisha@acme.example" } },
      { employee: { firstName: "Bruno", lastName: "Costa", email: "bruno@acme.example" } },
    ],
  });
  expect(body.data.apps.edges.find(({ node }) => node.name === "Asana")?.node).toMatchObject({
    catalogKey: null,
  });
  for (const { node } of body.data.apps.edges) {
    expect(node.users.length).toBeLessThanOrEqual(4);
  }
}, 90_000);

test("refuses an app user limit below one with a field error", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const discovered = await scannedApps(browser);
  const slack = discovered.find(({ name }) => name === "Slack")!;

  const response = await browser.graphql(
    "query ($id: ID!) { app(id: $id) { users(first: 0) { id } } }",
    { id: slack.id },
  );

  expect(await response.json()).toHaveProperty("errors.0.extensions", {
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "first", code: "out_of_range" }],
  });
}, 90_000);

test("the owner's consent and scan open the app list and selecting apps finishes setup", async ({
  env,
}) => {
  const { browser } = await env.signInAsOwner();
  const discovered = await scannedApps(browser);
  const approvedAppIds = discovered.filter(({ preselected }) => preselected).map(({ id }) => id);

  const response = await browser.graphql(
    `
    mutation FinishSetup($input: SetupFinishInput!) {
      apps { finishSetup(input: $input) { setup { step } error { __typename } } }
    }
  `,
    { input: { approvedAppIds } },
  );

  expect(await response.json()).toEqual({
    data: { apps: { finishSetup: { setup: { step: "DONE" }, error: null } } },
  });
  const counts = await browser.graphql(
    "{ appCounts { approved discovered ignored } setup { step } }",
  );
  expect(await counts.json()).toEqual({
    data: { appCounts: { approved: 7, discovered: 0, ignored: 31 }, setup: { step: "DONE" } },
  });
}, 90_000);

test("updates app counts when ignoring and approving apps after setup", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const discovered = await scannedApps(browser);
  const approvedAppIds = discovered.filter(({ preselected }) => preselected).map(({ id }) => id);
  const claude = discovered.find(({ name }) => name === "Claude")!;
  const chatgpt = discovered.find(({ name }) => name === "ChatGPT")!;
  const finished = await browser.graphql(
    "mutation FinishSetup($input: SetupFinishInput!) { apps { finishSetup(input: $input) { error { __typename } } } }",
    { input: { approvedAppIds } },
  );
  expect(await finished.json()).toEqual({ data: { apps: { finishSetup: { error: null } } } });

  const initial = await browser.graphql("{ appCounts { approved discovered ignored } }");
  expect(await initial.json()).toEqual({
    data: { appCounts: { approved: 7, discovered: 0, ignored: 31 } },
  });

  const ignored = await browser.graphql(
    `
    mutation IgnoreApp($input: AppIgnoreInput!) {
      apps { ignore(input: $input) { app { id status } error { __typename } } }
    }
  `,
    { input: { id: claude.id } },
  );
  expect(await ignored.json()).toEqual({
    data: { apps: { ignore: { app: { id: claude.id, status: "IGNORED" }, error: null } } },
  });
  const afterIgnoring = await browser.graphql("{ appCounts { approved discovered ignored } }");
  expect(await afterIgnoring.json()).toEqual({
    data: { appCounts: { approved: 6, discovered: 0, ignored: 32 } },
  });

  const approved = await browser.graphql(
    `
    mutation ApproveApp($input: AppApproveInput!) {
      apps { approve(input: $input) { app { id status } error { __typename } } }
    }
  `,
    { input: { id: chatgpt.id } },
  );
  expect(await approved.json()).toEqual({
    data: { apps: { approve: { app: { id: chatgpt.id, status: "APPROVED" }, error: null } } },
  });
  const afterApproving = await browser.graphql("{ appCounts { approved discovered ignored } }");
  expect(await afterApproving.json()).toEqual({
    data: { appCounts: { approved: 7, discovered: 0, ignored: 31 } },
  });

  const list = await browser.graphql(
    "{ apps(status: APPROVED) { edges { node { name connected suspendedWithAccessCount } } } }",
  );
  expect(await list.json()).toMatchObject({
    data: {
      apps: {
        edges: expect.arrayContaining([
          { node: { name: "Google Workspace", connected: true, suspendedWithAccessCount: 0 } },
          { node: { name: "Slack", connected: false, suspendedWithAccessCount: 2 } },
        ]) as unknown,
      },
    },
  });
}, 90_000);

test("reads Figma and its users with their directory status after setup", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const discovered = await scannedApps(browser);
  const approvedAppIds = discovered.filter(({ preselected }) => preselected).map(({ id }) => id);
  const figma = discovered.find(({ name }) => name === "Figma")!;
  const finished = await browser.graphql(
    "mutation FinishSetup($input: SetupFinishInput!) { apps { finishSetup(input: $input) { error { __typename } } } }",
    { input: { approvedAppIds } },
  );
  expect(await finished.json()).toEqual({ data: { apps: { finishSetup: { error: null } } } });

  const response = await browser.graphql(
    `query App($id: ID!) {
      app(id: $id) {
        id name peopleCount suspendedWithAccessCount
        users {
          id foundVia since { before }
          employee { firstName lastName email status }
        }
      }
    }`,
    { id: figma.id },
  );

  const body = (await response.json()) as { data: { app: { users: unknown[] } } };
  expect(body).not.toHaveProperty("errors");
  expect(body).toMatchObject({
    data: {
      app: { id: figma.id, name: "Figma", peopleCount: 16, suspendedWithAccessCount: 1 },
    },
  });
  expect(body.data.app.users).toHaveLength(16);
  expect(body.data.app.users[0]).toEqual({
    id: expect.any(String) as unknown,
    foundVia: ["google_sign_in"],
    since: { before: true },
    employee: {
      firstName: "Ana",
      lastName: "Ruiz",
      email: "ana@acme.example",
      status: "SUSPENDED",
    },
  });
}, 90_000);

test("returns ConflictError when ignoring Google Workspace through GraphQL", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const approved = await browser.graphql(
    "{ apps(status: APPROVED) { edges { node { id name } } } }",
  );
  const { data } = (await approved.json()) as {
    data: { apps: { edges: { node: { id: string; name: string } }[] } };
  };
  const { node: google } = data.apps.edges.find(({ node }) => node.name === "Google Workspace")!;

  const response = await browser.graphql(
    `
    mutation IgnoreApp($input: AppIgnoreInput!) {
      apps { ignore(input: $input) { app { id } error { __typename } } }
    }
  `,
    { input: { id: google.id } },
  );

  expect(await response.json()).toEqual({
    data: { apps: { ignore: { app: null, error: { __typename: "ConflictError" } } } },
  });
});

test.for([
  ["app", '{ app(id: "00000000-0000-4000-8000-000000000001") { id } }'],
  ["apps", "{ apps(status: DISCOVERED) { edges { node { id } } } }"],
  ["appCounts", "{ appCounts { approved discovered ignored } }"],
  [
    "apps.approve",
    'mutation { apps { approve(input: { id: "00000000-0000-4000-8000-000000000001" }) { app { id } error { __typename } } } }',
  ],
  [
    "apps.ignore",
    'mutation { apps { ignore(input: { id: "00000000-0000-4000-8000-000000000001" }) { app { id } error { __typename } } } }',
  ],
  [
    "apps.finishSetup",
    "mutation { apps { finishSetup(input: { approvedAppIds: [] }) { setup { step } error { __typename } } } }",
  ],
] as const)("refuses %s without a session", async ([, query], { env }) => {
  await env.signInAsOwner();

  const response = await env.browser().graphql(query);

  expect(response.status).toBe(200);
  expect(await response.json()).toHaveProperty("errors.0.extensions", {
    code: "UNAUTHENTICATED",
    fieldErrors: [],
  });
});
