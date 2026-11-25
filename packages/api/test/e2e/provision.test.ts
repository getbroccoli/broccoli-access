import {
  ACCOUNT_CHANGE_POLL,
  type Browser,
  connectedLinear,
  connectorTest as test,
  expect,
  linearInvitations,
} from "#test/support";

test("the owner provisions Ivan and Linear holds one invitation with his template's role", async ({
  env,
  fakeConnectors,
}) => {
  const { browser, appId, owner } = await connectedLinear(env);
  const ivan = await readIvan(browser);
  await env.seed.assignedTemplateApp({
    employeeId: ivan.id,
    appId,
    role: "admin",
    assignedBy: owner.id,
  });
  expect((await readIvan(browser)).provisionSteps).toEqual([
    { action: "INVITE", app: { id: appId } },
  ]);

  const response = await browser.graphql(PROVISION_EMPLOYEE, {
    input: { employeeId: ivan.id, appIds: [appId] },
  });

  expect(await response.json()).toEqual({
    data: { apps: { provisionEmployee: { employee: { id: ivan.id }, error: null } } },
  });
  await expect
    .poll(() => readChanges(browser), ACCOUNT_CHANGE_POLL)
    .toEqual([
      {
        action: "INVITE",
        startedFrom: "PROVISION",
        status: "SUCCEEDED",
        employee: { id: ivan.id },
      },
    ]);
  expect(await linearInvitations(fakeConnectors.url, "ivan@acme.example")).toMatchObject([
    { role: "admin" },
  ]);
  expect((await readIvan(browser)).provisionSteps).toEqual([]);
}, 90_000);

test("refuses to provision without a session", async ({ env }) => {
  const response = await env.browser().graphql(PROVISION_EMPLOYEE, {
    input: { employeeId: "00000000-0000-4000-8000-000000000001", appIds: [] },
  });

  expect(await response.json()).toHaveProperty("errors.0.extensions", {
    code: "UNAUTHENTICATED",
    fieldErrors: [],
  });
});

const PROVISION_EMPLOYEE = `mutation ($input: EmployeeProvisionInput!) {
  apps { provisionEmployee(input: $input) {
    employee { id }
    error { __typename ... on Error { message } }
  } }
}`;

async function readIvan(browser: Browser) {
  const response = await browser.graphql(`{
    employees(filter: { search: "ivan@acme.example" }) { edges { node {
      id provisionSteps { action app { id } }
    } } }
  }`);
  const body = (await response.json()) as {
    data: { employees: { edges: { node: { id: string; provisionSteps: unknown[] } }[] } };
  };
  expect(body).not.toHaveProperty("errors");
  return body.data.employees.edges[0]!.node;
}

async function readChanges(browser: Browser) {
  const response = await browser.graphql(`{
    accountChanges { edges { node { action startedFrom status employee { id } } } }
  }`);
  const body = (await response.json()) as {
    data: { accountChanges: { edges: { node: unknown }[] } };
  };
  return body.data.accountChanges.edges.map(({ node }) => node);
}
