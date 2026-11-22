import {
  expect,
  finishSetupWithPreselectedApps,
  LINEAR_INPUT,
  linearMemberStatus,
  connectorTest as test,
  type TestEnv,
  type Browser,
} from "#test/support";

test("the owner disables Chloé in Linear and enables her again", async ({
  env,
  fakeConnectors,
}) => {
  const { browser, appId } = await connectedLinear(env);
  const initial = await linearUsers(browser, appId);
  const chloe = initial.find((user) => user.employee.email === "chloe@acme.example")!;
  expect(chloe).toMatchObject({
    status: "ACTIVE",
    isConnectionUser: false,
    offeredChange: "SUSPEND",
    latestChange: null,
  });

  const disable = await changeAccount(browser, chloe.id, "SUSPEND");
  expect(disable).toMatchObject({
    id: chloe.id,
    offeredChange: null,
    latestChange: { action: "SUSPEND", status: "RUNNING" },
  });
  await expect
    .poll(
      async () => (await linearUsers(browser, appId)).find((user) => user.id === chloe.id),
      POLL,
    )
    .toMatchObject({
      status: "SUSPENDED",
      offeredChange: "REACTIVATE",
      latestChange: { id: disable.latestChange!.id, status: "SUCCEEDED" },
    });
  expect(await linearMemberStatus(fakeConnectors.url, chloe.employee.email)).toBe("suspended");

  const enable = await changeAccount(browser, chloe.id, "REACTIVATE");
  expect(enable).toMatchObject({
    id: chloe.id,
    offeredChange: null,
    latestChange: { action: "REACTIVATE", status: "RUNNING" },
  });
  await expect
    .poll(
      async () => (await linearUsers(browser, appId)).find((user) => user.id === chloe.id),
      POLL,
    )
    .toMatchObject({
      status: "ACTIVE",
      offeredChange: "SUSPEND",
      latestChange: { id: enable.latestChange!.id, status: "SUCCEEDED" },
    });
  expect(await linearMemberStatus(fakeConnectors.url, chloe.employee.email)).toBe("active");
}, 90_000);

test("shows one change ahead of Chloé while Ana's Disable runs, then finishes them in order", async ({
  env,
  fakeConnectors,
}) => {
  const { browser, appId } = await connectedLinear(env);
  const users = await linearUsers(browser, appId);
  const ana = users.find((user) => user.employee.email === "ana@acme.example")!;
  const chloe = users.find((user) => user.employee.email === "chloe@acme.example")!;
  const delay = await fetch(`${fakeConnectors.url}/_fake/delay`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ milliseconds: 3000 }),
  });
  expect(delay.status).toBe(204);

  await changeAccount(browser, ana.id, "SUSPEND");
  const queued = await changeAccount(browser, chloe.id, "SUSPEND");

  expect(queued.latestChange).toMatchObject({ status: "RUNNING", changesAhead: 1 });
  const pair = async () => {
    const users = await linearUsers(browser, appId);
    return [ana, chloe].map(({ id }) => users.find((user) => user.id === id)!.latestChange);
  };
  await expect.poll(pair, POLL).toMatchObject([{ status: "SUCCEEDED" }, { status: "SUCCEEDED" }]);
  const [first, second] = await pair();
  expect(Date.parse(second!.finishedAt!)).toBeGreaterThan(Date.parse(first!.finishedAt!));
}, 90_000);

test("changing an account requires a session", async ({ env }) => {
  const response = await env
    .browser()
    .graphql(CHANGE, { input: { id: "00000000-0000-4000-8000-000000000001", action: "SUSPEND" } });

  expect(await response.json()).toMatchObject({
    errors: [{ extensions: { code: "UNAUTHENTICATED" } }],
  });
});

interface AppUser {
  id: string;
  employee: { email: string };
  status: string;
  isConnectionUser: boolean;
  offeredChange: string | null;
  latestChange: {
    id: string;
    action: string;
    status: string;
    changesAhead: number | null;
    finishedAt: string | null;
  } | null;
}

const POLL = { timeout: 30_000, interval: 250 };
const USER_FIELDS = `id employee { email } status isConnectionUser offeredChange
  latestChange { id action status changesAhead finishedAt }`;
const CHANGE = `mutation ($input: AppUserChangeInput!) {
  apps { changeAccount(input: $input) { appUser { ${USER_FIELDS} } error { __typename } } }
}`;

async function connectedLinear(env: TestEnv) {
  const { browser } = await env.signInAsOwner();
  await finishSetupWithPreselectedApps(browser);
  const response = await browser.graphql(
    `mutation ($input: ContainerConnectorConnectInput!) {
    connectors { connect(input: $input) { containerConnector { id } error { __typename } } }
  }`,
    { input: LINEAR_INPUT },
  );
  expect(await response.json()).toEqual({
    data: { connectors: { connect: { containerConnector: { id: "linear" }, error: null } } },
  });
  const apps = await browser.graphql(
    "{ apps(status: APPROVED) { edges { node { id catalogKey } } } }",
  );
  const body = (await apps.json()) as {
    data: { apps: { edges: { node: { id: string; catalogKey: string | null } }[] } };
  };
  const appId = body.data.apps.edges.find(({ node }) => node.catalogKey === "linear")!.node.id;
  await expect
    .poll(async () => {
      const result = await browser.graphql("query ($id: ID!) { app(id: $id) { users { id } } }", {
        id: appId,
      });
      const read = (await result.json()) as { data: { app: { users: unknown[] } } };
      return read.data.app.users.length;
    }, POLL)
    .toBe(7);
  return { browser, appId };
}

async function linearUsers(browser: Browser, appId: string) {
  const response = await browser.graphql(
    `query ($id: ID!) { app(id: $id) { canChangeAccounts users { ${USER_FIELDS} } } }`,
    { id: appId },
  );
  const body = (await response.json()) as {
    data: { app: { canChangeAccounts: boolean; users: AppUser[] } };
  };
  expect(body).not.toHaveProperty("errors");
  expect(body.data.app.canChangeAccounts).toBe(true);
  return body.data.app.users;
}

async function changeAccount(browser: Browser, id: string, action: "SUSPEND" | "REACTIVATE") {
  const response = await browser.graphql(CHANGE, { input: { id, action } });
  const body = (await response.json()) as {
    data: { apps: { changeAccount: { appUser: AppUser; error: unknown } } };
  };
  expect(body).not.toHaveProperty("errors");
  expect(body.data.apps.changeAccount.error).toBeNull();
  return body.data.apps.changeAccount.appUser;
}
