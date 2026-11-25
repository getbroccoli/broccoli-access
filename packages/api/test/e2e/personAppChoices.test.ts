import { type Browser, expect, finishSetupWithDemoApps, test, type TestEnv } from "#test/support";

test("the owner adds an app for one person, removes a template's app for them and undoes it", async ({
  env,
}) => {
  const { browser, user: owner } = await env.signInAsOwner();
  await finishSetupWithDemoApps(browser);
  const employeeId = await ivanId(browser);
  const intranet = await approvedIntranet(env);
  const input = { employeeId, appId: intranet.id };

  expect(await changeChoice(browser, "addPersonApp", "PersonAppAddInput", input)).toEqual({
    choice: "ADDED_FOR_PERSON",
    state: "MISSING",
  });

  const template = await env.seed.template({ appIds: [intranet.id] });
  await env.seed.employeeTemplate({ employeeId, templateId: template.id, assignedBy: owner.id });
  expect(await changeChoice(browser, "removePersonApp", "PersonAppRemoveInput", input)).toEqual({
    choice: "REMOVED_FOR_PERSON",
    state: null,
  });

  expect(
    await changeChoice(browser, "undoPersonAppChoice", "PersonAppUndoChoiceInput", input),
  ).toEqual({ choice: null, state: "MISSING" });
});

test("refuses a signed-out caller who adds an app for a person", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  await finishSetupWithDemoApps(browser);
  const employeeId = await ivanId(browser);
  const intranet = await approvedIntranet(env);

  const response = await env.browser().graphql(
    `mutation ($input: PersonAppAddInput!) {
      templates { addPersonApp(input: $input) { employee { id } error { __typename } } }
    }`,
    { input: { employeeId, appId: intranet.id } },
  );

  expect(await response.json()).toMatchObject({
    errors: [{ extensions: { code: "UNAUTHENTICATED" } }],
  });
  const apps = await browser.graphql(
    `query ($id: ID!) { employee(id: $id) { personApps { edges { node { app { id } } } } } }`,
    { id: employeeId },
  );
  expect(JSON.stringify(await apps.json())).not.toContain(intranet.id);
});

/** An approved app that the fake Google's scan never finds. */
function approvedIntranet(env: TestEnv) {
  return env.seed.app({
    name: "Intranet",
    domain: "intranet.example.com",
    catalogKey: null,
    status: "approved",
  });
}

async function ivanId(browser: Browser) {
  const people = await browser.graphql(`{
    employees(filter: { search: "ivan@acme.example" }) { edges { node { id } } }
  }`);
  const { data } = (await people.json()) as {
    data: { employees: { edges: { node: { id: string } }[] } };
  };
  return data.employees.edges[0]!.node.id;
}

/** Runs one choice mutation and returns the app's row from the payload's employee. */
async function changeChoice(
  browser: Browser,
  operation: string,
  inputType: string,
  input: { employeeId: string; appId: string },
) {
  const response = await browser.graphql(
    `mutation ($input: ${inputType}!) {
      templates { ${operation}(input: $input) {
        employee { personApps { edges { node { app { id } choice state } } } }
        error { __typename }
      } }
    }`,
    { input },
  );
  const body = (await response.json()) as {
    data: {
      templates: Record<
        string,
        {
          employee: {
            personApps: {
              edges: {
                node: { app: { id: string }; choice: string | null; state: string | null };
              }[];
            };
          };
          error: unknown;
        }
      >;
    };
  };
  expect(body).not.toHaveProperty("errors");
  const payload = body.data.templates[operation]!;
  expect(payload.error).toBeNull();
  const row = payload.employee.personApps.edges.find(({ node }) => node.app.id === input.appId);
  return row && { choice: row.node.choice, state: row.node.state };
}
