import {
  ACCOUNT_CHANGE_POLL,
  type Browser,
  CHANGE_ACCOUNT,
  consentAtGoogle,
  connectedLinear,
  connectorTest,
  expect,
  finishSetupWithDemoApps,
  grantAtFakeGoogle,
  linearMemberStatus,
  readGoogleConnection,
  SCAN_NOW,
  test,
} from "#test/support";

const LINK = `mutation ($appAccountId: ID!, $employeeId: ID!) {
  apps { linkAccount(input: { appAccountId: $appAccountId, employeeId: $employeeId }) {
    appUser { id email employee { id } } error { __typename }
  } }
}`;

const MARKED_FIELDS = "id email app { id } kind note canEdit";
const EDIT_NOTE = `mutation ($appAccountId: ID!, $note: String!) {
  apps { editAccountNote(input: {appAccountId: $appAccountId, note: $note}) {
    account { ${MARKED_FIELDS} } error { __typename }
  } }
}`;
const MARKED = `query ($first: Int, $after: String) {
  markedAccounts(first: $first, after: $after) { edges { node { ${MARKED_FIELDS} } } }
}`;

test("the owner reads a suggested person and links the account over GraphQL", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  await finishSetupWithDemoApps(browser);
  const app = await env.seed.app({ name: "Design", catalogKey: null, status: "approved" });
  const account = await env.seed.appAccount({ appId: app.id, email: "chloe@private.example" });
  const people = await browser.graphql(
    '{ employees(filter: { search: "chloe@acme.example" }) { edges { node { id } } } }',
  );
  const { data } = (await people.json()) as {
    data: { employees: { edges: { node: { id: string } }[] } };
  };
  const employee = data.employees.edges[0]!.node;

  const listed = await browser.graphql(LIST, { first: 1, after: null });
  expect(await listed.json()).toEqual({
    data: {
      accountsWithoutPersonCount: 1,
      accountsWithoutPerson: {
        edges: [
          {
            node: {
              id: account.id,
              app: { id: app.id },
              email: account.email,
              displayName: null,
              suggestedEmployee: employee,
            },
          },
        ],
      },
    },
  });

  const linked = await browser.graphql(LINK, {
    appAccountId: account.id,
    employeeId: employee.id.toUpperCase(),
  });
  expect(await linked.json()).toEqual({
    data: {
      apps: {
        linkAccount: {
          appUser: { id: account.id, email: account.email, employee },
          error: null,
        },
      },
    },
  });
}, 90_000);

test.for([
  ["account list", "{ accountsWithoutPerson { edges { node { id } } } }"],
  ["account count", "{ accountsWithoutPersonCount }"],
  ["link", LINK],
  ["marked accounts", MARKED],
  ["mark", markAccount("SERVICE")],
  ["edit note", EDIT_NOTE],
] as const)("refuses the %s without a session", async ([, operation], { env }) => {
  await env.signInAsOwner();
  const id = "00000000-0000-4000-8000-000000000001";

  const response = await env
    .browser()
    .graphql(operation, { appAccountId: id, employeeId: id, note: "Agency" });

  expect(await response.json()).toHaveProperty("errors.0.extensions", {
    code: "UNAUTHENTICATED",
    fieldErrors: [],
  });
});

const LIST = `query ($first: Int, $after: String) {
  accountsWithoutPerson(first: $first, after: $after) {
    edges { node { id email displayName app { id } suggestedEmployee { id } } }
  }
  accountsWithoutPersonCount
}`;

test("the owner marks both kinds of accounts and reads an edited note over GraphQL", async ({
  env,
}) => {
  const { browser } = await env.signInAsOwner();
  await finishSetupWithDemoApps(browser);
  const app = await env.seed.app({ name: "Design", catalogKey: null, status: "approved" });
  const account = await env.seed.appAccount({ appId: app.id });
  const row = {
    id: account.id,
    email: account.email,
    app: { id: app.id },
    kind: "EXTERNAL",
    canEdit: true,
  };
  const input = { appAccountId: account.id, note: "Agency" };
  const bot = await env.seed.appAccount({ appId: app.id });
  const service = await browser.graphql(markAccount("SERVICE"), {
    appAccountId: bot.id,
    note: "Deploys",
  });
  expect(await service.json()).toMatchObject({
    data: {
      apps: {
        markAccount: { account: { id: bot.id, kind: "SERVICE", note: "Deploys" }, error: null },
      },
    },
  });

  const marked = await browser.graphql(markAccount("EXTERNAL"), input);
  expect(await marked.json()).toEqual({
    data: { apps: { markAccount: { account: { ...row, note: input.note }, error: null } } },
  });
  const invalid = await browser.graphql(EDIT_NOTE, { ...input, note: " " });
  expect(await invalid.json()).toEqual({
    data: {
      apps: { editAccountNote: { account: null, error: { __typename: "InvalidInputError" } } },
    },
  });
  const note = "Contract ends in March";
  const edited = await browser.graphql(EDIT_NOTE, { ...input, note });
  expect(await edited.json()).toEqual({
    data: { apps: { editAccountNote: { account: { ...row, note }, error: null } } },
  });
  const listed = await browser.graphql(MARKED, { first: 2, after: null });
  expect(await listed.json()).toMatchObject({
    data: {
      markedAccounts: {
        edges: expect.arrayContaining([
          { node: { ...row, note } },
          {
            node: {
              id: bot.id,
              email: bot.email,
              app: { id: app.id },
              kind: "SERVICE",
              note: "Deploys",
              canEdit: true,
            },
          },
        ]) as unknown,
      },
    },
  });
}, 90_000);

connectorTest(
  "the owner disables an account without a person and its row shows the change and offers Enable",
  async ({ env, fakeConnectors }) => {
    const { browser } = await connectedLinear(env);
    const account = await unlinkedDeployAccount(browser);
    expect(account).toMatchObject({
      status: "ACTIVE",
      offeredChange: "SUSPEND",
      latestChange: null,
    });

    const disabled = await browser.graphql(CHANGE_ACCOUNT, {
      input: { id: account.id, action: "SUSPEND" },
    });

    expect(await disabled.json()).toMatchObject({
      data: { apps: { changeAccount: { error: null } } },
    });
    await expect
      .poll(() => unlinkedDeployAccount(browser), ACCOUNT_CHANGE_POLL)
      .toMatchObject({
        status: "SUSPENDED",
        offeredChange: "REACTIVATE",
        latestChange: { action: "SUSPEND", status: "SUCCEEDED", failure: null },
      });
    expect(await linearMemberStatus(fakeConnectors.url, account.email)).toBe("suspended");
    const { latestChange } = await unlinkedDeployAccount(browser);
    const change = await browser.graphql(
      "query ($id: ID!) { accountChange(id: $id) { id status email } }",
      { id: latestChange!.id },
    );
    expect(await change.json()).toEqual({
      data: {
        accountChange: { id: latestChange!.id, status: "SUCCEEDED", email: account.email },
      },
    });
  },
  90_000,
);

connectorTest(
  "refuses a stale Disable after a scan identifies the integration user's account",
  async ({ env, fakeGoogle, fakeConnectors }) => {
    const { browser } = await connectedLinear(env);
    const { id, email, offeredChange } = await unlinkedDeployAccount(browser);
    expect(offeredChange).toBe("SUSPEND");

    await classifyIntegrationAccount(browser, fakeGoogle.url, { id, email });
    const disabled = await browser.graphql(CHANGE_ACCOUNT, { input: { id, action: "SUSPEND" } });

    expect.soft(await disabled.json()).toEqual({
      data: {
        apps: { changeAccount: { appUser: null, error: { __typename: "ConflictError" } } },
      },
    });
    const activity = await browser.graphql("{ accountChanges { edges { node { id } } } }");
    expect.soft(await activity.json()).toEqual({ data: { accountChanges: { edges: [] } } });
    expect(await linearMemberStatus(fakeConnectors.url, email)).toBe("active");
  },
  90_000,
);

interface UnlinkedAccountRow {
  id: string;
  email: string;
  status: string;
  offeredChange: string | null;
  latestChange: { id: string; action: string; status: string; failure: string | null } | null;
}

async function unlinkedDeployAccount(browser: Browser) {
  const response = await browser.graphql(
    `{ accountsWithoutPerson { edges { node {
      id email status offeredChange latestChange { id action status failure }
    } } } }`,
  );
  const body = (await response.json()) as {
    data: { accountsWithoutPerson: { edges: { node: UnlinkedAccountRow }[] } };
  };
  expect(body).not.toHaveProperty("errors");
  const account = body.data.accountsWithoutPerson.edges.find(
    ({ node }) => node.email === "deploys@acme.example",
  );
  expect(account).toBeDefined();
  return account!.node;
}

async function classifyIntegrationAccount(
  browser: Browser,
  googleUrl: string,
  { id, email }: { id: string; email: string },
) {
  const start = await browser.post("/api/google/integration-user", { email });
  expect(start.status).toBe(200);
  const { authorizationUrl } = (await start.json()) as { authorizationUrl: string };
  const callback = await consentAtGoogle(authorizationUrl);
  await browser.getManual(callback.href);
  await grantAtFakeGoogle(googleUrl, { email, clientId: "linear-client", appName: "Linear" });
  const google = await readGoogleConnection(browser);
  const scan = await browser.graphql(SCAN_NOW, { connectionId: google.id });
  expect(await scan.json()).toMatchObject({
    data: { imports: { scanConnection: { scan: { status: "SCANNING" } } } },
  });
  await expect
    .poll(async () => (await browser.graphql(MARKED)).json(), ACCOUNT_CHANGE_POLL)
    .toMatchObject({
      data: {
        markedAccounts: {
          // Beside its own Google Workspace account, which the same scan marks.
          edges: expect.arrayContaining([
            { node: expect.objectContaining({ id, kind: "SERVICE", canEdit: false }) as unknown },
          ]) as unknown,
        },
      },
    });
}

function markAccount(kind: "SERVICE" | "EXTERNAL") {
  return `mutation ($appAccountId: ID!, $note: String!) {
  apps { markAccount(input: {appAccountId: $appAccountId, kind: ${kind}, note: $note}) {
    account { ${MARKED_FIELDS} } error { __typename }
  } }
}`;
}
