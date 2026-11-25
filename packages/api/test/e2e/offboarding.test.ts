import { vi } from "vitest";

import {
  ACCOUNT_CHANGE_POLL,
  type TestEnv,
  allowGoogleUserWrites,
  connectedLinear,
  connectorTest as test,
  expect,
  finishSetupWithDemoApps,
} from "#test/support";

test("the owner offboards a person and sees their suspended directory account and the changes in Activity", async ({
  env,
}) => {
  const { browser, id, email, preview } = await offboardChloe(env);
  expect(preview).toMatchObject({
    data: {
      employee: {
        directoryAccount: { status: "ACTIVE" },
        offboarding: {
          offboardedAt: null,
          accountsToDisable: [{ app: { name: "Google Workspace" } }, { app: { name: "Linear" } }],
        },
      },
    },
  });

  const change = { email, action: "SUSPEND", status: "SUCCEEDED", startedFrom: "OFFBOARDING" };
  await expect
    .poll(async () => (await browser.graphql(OFFBOARDING, { id })).json(), ACCOUNT_CHANGE_POLL)
    .toMatchObject({
      data: {
        employee: {
          directoryAccount: { status: "SUSPENDED" },
          offboarding: {
            offboardedAt: expect.any(String) as unknown,
            accountsToDisable: [],
            byHandWork: expect.arrayContaining([
              { app: { name: "Notion" }, reason: "APP_HAS_NO_CONNECTION" },
            ]) as unknown,
          },
        },
        accountChanges: {
          edges: expect.arrayContaining(
            ["Linear", "Google Workspace"].map((name) => ({
              node: { ...change, app: { name } },
            })),
          ) as unknown,
        },
      },
    });
}, 90_000);

test("the owner removes the disabled Linear account and sees its Remove in Activity while Google stays suspended", async ({
  env,
}) => {
  const { browser, id, email } = await offboardChloe(env);
  const removal = `query ($id: ID!) {
    employee(id: $id) { directoryAccount { status } offboarding { accountsToRemove { id app { name } } } }
  }`;
  const accounts = await vi.waitFor(async () => {
    const response = await browser.graphql(removal, { id });
    const { data } = (await response.json()) as {
      data: {
        employee: {
          directoryAccount: { status: string };
          offboarding: { accountsToRemove: { id: string; app: { name: string } }[] };
        };
      };
    };
    expect(data.employee.directoryAccount.status).toBe("SUSPENDED");
    const { accountsToRemove } = data.employee.offboarding;
    expect(accountsToRemove).toMatchObject([{ app: { name: "Linear" } }]);
    return accountsToRemove;
  }, ACCOUNT_CHANGE_POLL);

  const response = await browser.graphql(
    `mutation ($input: EmployeeRemoveAccountsInput!) {
      apps { removeEmployeeAccounts(input: $input) { employee { id } error { __typename } } }
    }`,
    { input: { employeeId: id, accountIds: accounts.map((account) => account.id) } },
  );
  expect(await response.json()).toEqual({
    data: { apps: { removeEmployeeAccounts: { employee: { id }, error: null } } },
  });

  await expect
    .poll(async () => (await browser.graphql(OFFBOARDING, { id })).json(), ACCOUNT_CHANGE_POLL)
    .toMatchObject({
      data: {
        employee: { directoryAccount: { status: "SUSPENDED" } },
        accountChanges: {
          edges: expect.arrayContaining([
            {
              node: {
                app: { name: "Linear" },
                email,
                action: "REMOVE",
                status: "SUCCEEDED",
                startedFrom: "ACCOUNT",
              },
            },
          ]) as unknown,
        },
      },
    });
}, 90_000);

test("Google consent returns the owner to their page and enables directory writes", async ({
  env,
}) => {
  const { browser } = await env.signInAsOwner();
  await finishSetupWithDemoApps(browser);
  const settings = "{ setup { googleWorkspace { canChangeUsers } } }";
  expect(await (await browser.graphql(settings)).json()).toEqual({
    data: { setup: { googleWorkspace: { canChangeUsers: false } } },
  });

  const redirect = await allowGoogleUserWrites(browser, "/people?tab=active");

  expect(redirect.headers.get("location")).toBe("/people?tab=active&googleUserWrites=allowed");
  expect(await (await browser.graphql(settings)).json()).toEqual({
    data: { setup: { googleWorkspace: { canChangeUsers: true } } },
  });
}, 90_000);

const OFFBOARDING = `query ($id: ID!) {
  employee(id: $id) { directoryAccount { status } offboarding {
    offboardedAt accountsToDisable { app { id name } } byHandWork { app { name } reason }
  } }
  accountChanges { edges { node { app { name } email action status startedFrom } } }
}`;

async function offboardChloe(env: TestEnv) {
  const { browser, appId } = await connectedLinear(env);
  const users = await browser.graphql(
    "query ($id: ID!) { app(id: $id) { users { employee { id email } } } }",
    { id: appId },
  );
  const { data } = (await users.json()) as {
    data: { app: { users: { employee: { id: string; email: string } }[] } };
  };
  const { id, email } = data.app.users.find(
    ({ employee }) => employee.email === "chloe@acme.example",
  )!.employee;
  const before = await browser.graphql(OFFBOARDING, { id });
  const preview = (await before.json()) as {
    data: { employee: { offboarding: { accountsToDisable: { app: { id: string } }[] } } };
  };
  await allowGoogleUserWrites(browser, `/people/${id}`);

  const response = await browser.graphql(
    `mutation ($input: EmployeeOffboardInput!) {
    apps { offboardEmployee(input: $input) { employee { id } error { __typename } } }
  }`,
    {
      input: {
        employeeId: id,
        appIds: preview.data.employee.offboarding.accountsToDisable.map(({ app }) => app.id),
      },
    },
  );
  expect(await response.json()).toEqual({
    data: { apps: { offboardEmployee: { employee: { id }, error: null } } },
  });
  return { browser, id, email, preview };
}
