import { expect, finishSetupWithPreselectedApps, test } from "#test/support";

test("reads a suspended person's current access through the API", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  await finishSetupWithPreselectedApps(browser);
  const people = await browser.graphql(`{
    employees(filter: { search: "ana@acme.example" }) { edges { node { id } } }
  }`);
  const { data } = (await people.json()) as {
    data: { employees: { edges: { node: { id: string } }[] } };
  };
  const { id } = data.employees.edges[0]!.node;

  const response = await browser.graphql(
    `query ($id: ID!) {
      employee(id: $id) {
        id status suspendedWithAccess
        currentAccess { appName catalogKey foundVia since { at before } }
      }
    }`,
    { id },
  );

  expect(await response.json()).toEqual({
    data: {
      employee: {
        id,
        status: "SUSPENDED",
        suspendedWithAccess: true,
        currentAccess: ["Figma", "Notion", "Slack"].map((appName) => ({
          appName,
          catalogKey: appName.toLowerCase(),
          foundVia: ["google_sign_in"],
          since: {
            at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/) as unknown,
            before: true,
          },
        })),
      },
    },
  });
});

test("refuses a person's current access without a session", async ({ env }) => {
  await env.signInAsOwner();
  const employee = await env.seed.employee();

  const response = await env
    .browser()
    .graphql(`query ($id: ID!) { employee(id: $id) { currentAccess { appName } } }`, {
      id: employee.id,
    });

  expect(await response.json()).toHaveProperty("errors.0.extensions", {
    code: "UNAUTHENTICATED",
    fieldErrors: [],
  });
});
