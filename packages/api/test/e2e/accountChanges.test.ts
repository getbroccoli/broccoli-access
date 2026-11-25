import {
  ACCOUNT_CHANGE_POLL,
  CHANGE_ACCOUNT,
  changeAccount,
  connectedLinear,
  connectorTest as test,
  expect,
  failLinearCall,
  linearMemberStatus,
  linearUsers,
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
      ACCOUNT_CHANGE_POLL,
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
      ACCOUNT_CHANGE_POLL,
    )
    .toMatchObject({
      status: "ACTIVE",
      offeredChange: "SUSPEND",
      latestChange: { id: enable.latestChange!.id, status: "SUCCEEDED" },
    });
  expect(await linearMemberStatus(fakeConnectors.url, chloe.employee.email)).toBe("active");
}, 90_000);

test("the owner disables an extra Linear account from Differences", async ({ env }) => {
  const { browser, appId } = await connectedLinear(env);
  const users = await browser.graphql(
    `query ($id: ID!) {
    app(id: $id) { users { id employee { id email } } }
  }`,
    { id: appId },
  );
  const body = (await users.json()) as {
    data: { app: { users: { id: string; employee: { id: string; email: string } }[] } };
  };
  const chloe = body.data.app.users.find(
    ({ employee }) => employee.email === "chloe@acme.example",
  )!;
  await env.seed.employeeAppChoice({ appId, employeeId: chloe.employee.id, choice: "to_review" });

  const response = await browser.graphql(CHANGE_ACCOUNT, {
    input: { id: chloe.id, action: "SUSPEND", extraEmployeeId: chloe.employee.id },
  });

  expect(await response.json()).toMatchObject({
    data: {
      apps: {
        changeAccount: {
          appUser: { id: chloe.id, latestChange: { action: "SUSPEND" } },
          error: null,
        },
      },
    },
  });
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
  await expect
    .poll(pair, ACCOUNT_CHANGE_POLL)
    .toMatchObject([{ status: "SUCCEEDED" }, { status: "SUCCEEDED" }]);
  const [first, second] = await pair();
  expect(Date.parse(second!.finishedAt!)).toBeGreaterThan(Date.parse(first!.finishedAt!));
}, 90_000);

test("changing an account requires a session", async ({ env }) => {
  const response = await env.browser().graphql(CHANGE_ACCOUNT, {
    input: { id: "00000000-0000-4000-8000-000000000001", action: "SUSPEND" },
  });

  expect(await response.json()).toMatchObject({
    errors: [{ extensions: { code: "UNAUTHENTICATED" } }],
  });
});

test("Activity lists a Disable that succeeded and one that failed, with the person, app and requester", async ({
  env,
  fakeConnectors,
}) => {
  const { browser, appId } = await connectedLinear(env);
  const users = await linearUsers(browser, appId);
  const chloe = users.find((user) => user.employee.email === "chloe@acme.example")!;
  const ana = users.find((user) => user.employee.email === "ana@acme.example")!;
  const succeeded = await changeAccount(browser, chloe.id, "SUSPEND");
  await expect
    .poll(
      async () =>
        (await linearUsers(browser, appId)).find((user) => user.id === chloe.id)?.latestChange
          ?.status,
      ACCOUNT_CHANGE_POLL,
    )
    .toBe("SUCCEEDED");
  await failLinearCall(fakeConnectors.url, "actions/run", "not_allowed");
  const failed = await changeAccount(browser, ana.id, "SUSPEND");

  const disable = {
    action: "SUSPEND",
    app: { name: "Linear" },
    requestedBy: { name: "Mia Novak" },
    requestedAt: expect.any(String) as unknown,
    finishedAt: expect.any(String) as unknown,
  };
  await expect
    .poll(async () => (await browser.graphql(ACTIVITY)).json(), ACCOUNT_CHANGE_POLL)
    .toEqual({
      data: {
        accountChanges: {
          edges: [
            {
              node: {
                ...disable,
                id: failed.latestChange!.id,
                status: "FAILED",
                failure: "NOT_ALLOWED",
                email: ana.employee.email,
                employee: ana.employee,
              },
            },
            {
              node: {
                ...disable,
                id: succeeded.latestChange!.id,
                status: "SUCCEEDED",
                failure: null,
                email: chloe.employee.email,
                employee: chloe.employee,
              },
            },
          ],
        },
      },
    });
}, 90_000);

test("reading account changes requires a session", async ({ env }) => {
  const response = await env.browser().graphql(ACTIVITY);

  expect(await response.json()).toMatchObject({
    errors: [{ extensions: { code: "UNAUTHENTICATED" } }],
  });
});

const ACTIVITY = `{ accountChanges { edges { node {
  id action status failure email employee { email } app { name } requestedBy { name } requestedAt finishedAt
} } } }`;
