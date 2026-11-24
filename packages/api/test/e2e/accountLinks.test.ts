import { expect, finishSetupWithPreselectedApps, test } from "#test/support";

const LINK = `mutation ($appAccountId: ID!, $employeeId: ID!) {
  apps { linkAccount(input: { appAccountId: $appAccountId, employeeId: $employeeId }) {
    appUser { id email employee { id } } error { __typename }
  } }
}`;

test("the owner reads a suggested person and links the account over GraphQL", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  await finishSetupWithPreselectedApps(browser);
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
] as const)("refuses the %s without a session", async ([, operation], { env }) => {
  await env.signInAsOwner();
  const id = "00000000-0000-4000-8000-000000000001";

  const response = await env.browser().graphql(operation, { appAccountId: id, employeeId: id });

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
