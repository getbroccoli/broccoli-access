import { expect, test, scannedApps } from "#test/support";

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
          id suspendedInDirectory foundVia since { before }
          employee { firstName lastName email }
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
    suspendedInDirectory: true,
    foundVia: ["google_sign_in"],
    since: { before: true },
    employee: { firstName: "Ana", lastName: "Ruiz", email: "ana@acme.example" },
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
