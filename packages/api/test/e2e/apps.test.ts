import { expect, test, type Browser } from "#test/support";

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

test("approves and ignores an app through GraphQL after the scan", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const discovered = await scannedApps(browser);
  const { id } = discovered.find(({ name }) => name === "Slack")!;

  const approved = await browser.graphql(
    `
    mutation ApproveApp($input: AppApproveInput!) {
      apps { approve(input: $input) { app { id status } error { __typename } } }
    }
  `,
    { input: { id } },
  );

  expect(await approved.json()).toEqual({
    data: { apps: { approve: { app: { id, status: "APPROVED" }, error: null } } },
  });

  const ignored = await browser.graphql(
    `
    mutation IgnoreApp($input: AppIgnoreInput!) {
      apps { ignore(input: $input) { app { id status } error { __typename } } }
    }
  `,
    { input: { id } },
  );

  expect(await ignored.json()).toEqual({
    data: { apps: { ignore: { app: { id, status: "IGNORED" }, error: null } } },
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
  ["apps", "{ apps(status: DISCOVERED) { edges { node { id } } } }"],
  ["appCounts", "{ appCounts { approved discovered ignored } }"],
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

async function scannedApps(browser: Browser) {
  let discovered: { id: string; name: string; preselected: boolean }[] = [];
  await expect
    .poll(
      async () => {
        const response = await browser.graphql(`{
      apps(status: DISCOVERED) {
        edges { node { id name domain status peopleCount foundVia since { at before } preselected } }
        pageInfo { endCursor hasNextPage }
      }
      setup { step }
    }`);
        const body = (await response.json()) as {
          data?: {
            apps: { edges: { node: (typeof discovered)[number] }[] };
            setup: { step: string };
          };
        };
        discovered = body.data?.apps.edges.map(({ node }) => node) ?? [];
        return { count: discovered.length, step: body.data?.setup.step };
      },
      { timeout: 60_000, interval: 250 },
    )
    .toEqual({ count: 37, step: "SELECT_APPS" });
  return discovered;
}
