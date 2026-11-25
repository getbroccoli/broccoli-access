import {
  ACCOUNT_CHANGE_POLL,
  changeAccount,
  connectedLinear,
  connectorTest as test,
  expect,
  failLinearCall,
  linearUsers,
} from "#test/support";

test("the owner sees why Ana's Linear Disable failed and marks it done by hand", async ({
  env,
  fakeConnectors,
}) => {
  const { browser, appId, owner } = await connectedLinear(env);
  const ana = (await linearUsers(browser, appId)).find(
    (user) => user.employee.email === "ana@acme.example",
  )!;
  await failLinearCall(fakeConnectors.url, "actions/run", "unexpected_response");

  const disable = await changeAccount(browser, ana.id, "SUSPEND");
  const changeId = disable.latestChange!.id;
  await expect
    .poll(async () => {
      const response = await browser.graphql(
        `query ($id: ID!) {
          app(id: $id) {
            suspendedWithAccessCount
            users {
              id status employee { status }
              latestChange {
                id status failure requestedAt requestedBy { id name }
                attempts { at runtime failure }
              }
            }
          }
        }`,
        { id: appId },
      );
      return response.json();
    }, ACCOUNT_CHANGE_POLL)
    .toMatchObject({
      data: {
        app: {
          suspendedWithAccessCount: 1,
          users: expect.arrayContaining([
            {
              id: ana.id,
              status: "ACTIVE",
              employee: { status: "SUSPENDED" },
              latestChange: {
                id: changeId,
                status: "FAILED",
                failure: "UNEXPECTED_RESPONSE",
                requestedAt: expect.any(String) as unknown,
                requestedBy: { id: owner.id, name: "Mia Novak" },
                attempts: [
                  {
                    at: expect.any(String) as unknown,
                    runtime: "SERVER",
                    failure: "UNEXPECTED_RESPONSE",
                  },
                ],
              },
            },
          ]) as unknown,
        },
      },
    });

  const done = await browser.graphql(
    `mutation ($id: ID!) {
      apps {
        markAccountChangeDoneByHand(input: { id: $id }) {
          appUser { id status latestChange { id status failure } app { suspendedWithAccessCount } }
          error { __typename }
        }
      }
    }`,
    { id: changeId },
  );

  expect(await done.json()).toEqual({
    data: {
      apps: {
        markAccountChangeDoneByHand: {
          error: null,
          appUser: {
            id: ana.id,
            status: "SUSPENDED",
            latestChange: { id: changeId, status: "DONE_BY_HAND", failure: "UNEXPECTED_RESPONSE" },
            app: { suspendedWithAccessCount: 0 },
          },
        },
      },
    },
  });
}, 90_000);

test("a failed Disable on a private account identifies the linked employee in Activity and on retry", async ({
  env,
  fakeConnectors,
}) => {
  const { browser, appId } = await connectedLinear(env);
  const employee = await env.seed.employee();
  const list = await browser.graphql("{ accountsWithoutPerson { edges { node { id email } } } }");
  const { data } = (await list.json()) as {
    data: { accountsWithoutPerson: { edges: { node: { id: string; email: string } }[] } };
  };
  const account = data.accountsWithoutPerson.edges.find(
    ({ node }) => node.email === "deploys@acme.example",
  )!.node;
  const linked = await browser.graphql(
    `mutation ($account: ID!, $person: ID!) {
    apps { linkAccount(input: { appAccountId: $account, employeeId: $person }) { error { __typename } } }
  }`,
    { account: account.id, person: employee.id },
  );
  expect(await linked.json()).toEqual({ data: { apps: { linkAccount: { error: null } } } });
  await failLinearCall(fakeConnectors.url, "actions/run", "unexpected_response");
  const disable = await changeAccount(browser, account.id, "SUSPEND");
  await expect
    .poll(
      async () =>
        (await linearUsers(browser, appId)).find(({ id }) => id === account.id)?.latestChange
          ?.status,
      ACCOUNT_CHANGE_POLL,
    )
    .toBe("FAILED");

  const read = await browser.graphql(
    `query ($id: ID!) {
    employee(id: $id) { appAccounts { id offeredChange latestChange { ...FailedDisable } } }
    accountChanges { edges { node { ...FailedDisable } } }
  }
  fragment FailedDisable on AccountChange {
    id action status failure finishedAt email app { id } employee { id firstName lastName email }
  }`,
    { id: employee.id },
  );

  const failed = {
    id: disable.latestChange!.id,
    action: "SUSPEND",
    status: "FAILED",
    failure: "UNEXPECTED_RESPONSE",
    finishedAt: expect.any(String) as unknown,
    email: account.email,
    app: { id: appId },
    employee: {
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
    },
  };
  expect(await read.json()).toEqual({
    data: {
      employee: {
        appAccounts: [{ id: account.id, offeredChange: "SUSPEND", latestChange: failed }],
      },
      accountChanges: { edges: [{ node: failed }] },
    },
  });
}, 90_000);
