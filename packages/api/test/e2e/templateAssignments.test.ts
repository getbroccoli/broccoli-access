import {
  ACCOUNT_CHANGE_POLL,
  type Browser,
  changeAccount,
  connectedLinear,
  connectorTest as test,
  expect,
} from "#test/support";

test("an account marked Extra after take-off stays cleared when the owner disables and enables it", async ({
  env,
}) => {
  const { browser, appId } = await connectedLinear(env);
  const response = await browser.graphql(
    "query ($id: ID!) { app(id: $id) { users { id employee { id email } } } }",
    { id: appId },
  );
  const members = (await response.json()) as {
    data: { app: { users: { id: string; employee: { id: string; email: string } }[] } };
  };
  const chloe = members.data.app.users.find(
    ({ employee }) => employee.email === "chloe@acme.example",
  )!;
  const template = await env.seed.template({ name: "Engineer", appIds: [appId] });
  const input = { id: template.id, employeeId: chloe.employee.id };

  const assigned = await browser.graphql(
    `mutation ($input: TemplateAssignInput!) {
      templates { assign(input: $input) {
        template { id peopleCount people(first: 6) { edges { node { id templates { id } } } } } error { __typename }
      } }
    }`,
    { input },
  );
  expect(await assigned.json()).toEqual({
    data: {
      templates: {
        assign: {
          template: {
            id: template.id,
            peopleCount: 1,
            people: {
              edges: [{ node: { id: chloe.employee.id, templates: [{ id: template.id }] } }],
            },
          },
          error: null,
        },
      },
    },
  });
  const apps = () => employeeApps(browser, chloe.employee.id);
  expect(await apps()).toEqual(
    expect.arrayContaining([
      {
        app: { id: appId, catalogKey: "linear" },
        templates: [{ id: template.id }],
        role: null,
        state: "ACTIVE",
      },
      expect.objectContaining({
        app: { id: expect.any(String) as unknown, catalogKey: "google_workspace" },
        state: "ACTIVE",
      }),
    ]),
  );

  const removed = await browser.graphql(
    `mutation ($input: TemplateTakeOffInput!) {
      templates { takeOff(input: $input) { template { id peopleCount people(first: 6) { edges { node { id } } } } error { __typename } } }
    }`,
    { input },
  );
  expect(await removed.json()).toEqual({
    data: {
      templates: {
        takeOff: {
          template: { id: template.id, peopleCount: 0, people: { edges: [] } },
          error: null,
        },
      },
    },
  });
  const state = async () => (await apps()).find(({ app }) => app.id === appId)?.state;
  expect(await state()).toBe("EXTRA");

  await changeAccount(browser, chloe.id, "SUSPEND");
  await expect.poll(state, ACCOUNT_CHANGE_POLL).toBe("SUSPENDED");

  await changeAccount(browser, chloe.id, "REACTIVATE");
  await expect.poll(state, ACCOUNT_CHANGE_POLL).toBe("ACTIVE");
}, 90_000);

async function employeeApps(browser: Browser, id: string) {
  const response = await browser.graphql(
    `query ($id: ID!) {
      employee(id: $id) { personApps { app { id catalogKey } templates { id } role state } }
    }`,
    { id },
  );
  const body = (await response.json()) as {
    data: {
      employee: {
        personApps: {
          app: { id: string; catalogKey: string | null };
          templates: { id: string }[];
          role: string | null;
          state: string | null;
        }[];
      };
    };
  };
  expect(body).not.toHaveProperty("errors");
  return body.data.employee.personApps;
}
