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
        template { id peopleCount people(first: 6) { edges { node { id } } } } error { __typename }
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
              edges: [{ node: { id: chloe.employee.id } }],
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
        roleConflict: false,
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

test("the owner sets a template role from the connected app's roles", async ({ env }) => {
  const { browser, appId } = await connectedLinear(env);
  const template = await env.seed.template({ appIds: [appId] });

  const response = await browser.graphql(
    `mutation ($input: TemplateSetAppRoleInput!) {
      templates { setAppRole(input: $input) {
        template { apps { role app { id roles { key name isDefault } } } } error { __typename }
      } }
    }`,
    { input: { id: template.id, appId, role: "admin" } },
  );

  expect(await response.json()).toEqual({
    data: {
      templates: {
        setAppRole: {
          template: {
            apps: [
              {
                role: "admin",
                app: {
                  id: appId,
                  roles: expect.arrayContaining([
                    { key: "user", name: "User", isDefault: true },
                    { key: "admin", name: "Admin", isDefault: false },
                    { key: "guest", name: "Guest", isDefault: false },
                  ]) as unknown,
                },
              },
            ],
          },
          error: null,
        },
      },
    },
  });
});

test.for([
  { pick: "guest", saved: "guest" },
  { pick: "user", saved: null },
])(
  "picking $pick returns the saved role and resolves the conflict on the person's page",
  async ({ pick, saved }, { env }) => {
    const { browser, appId, owner } = await connectedLinear(env);
    const person = await env.seed.employee();
    const assignment = { employeeId: person.id, appId, assignedBy: owner.id };
    await env.seed.assignedTemplateApp({ ...assignment, role: null });
    await env.seed.assignedTemplateApp({ ...assignment, role: "guest" });

    const response = await browser.graphql(
      `mutation ($input: TemplatePickRoleInput!) {
      templates { pickRole(input: $input) { role error { __typename } } }
    }`,
      { input: { employeeId: person.id, appId, role: pick } },
    );

    expect(await response.json()).toEqual({
      data: { templates: { pickRole: { role: saved, error: null } } },
    });
    const apps = await employeeApps(browser, person.id);
    expect(apps.find(({ app }) => app.id === appId)).toMatchObject({
      role: saved,
      roleConflict: false,
    });
  },
);

async function employeeApps(browser: Browser, id: string) {
  const response = await browser.graphql(
    `query ($id: ID!) {
      employee(id: $id) { personApps(first: 20) { edges { node { app { id catalogKey } templates { id } role roleConflict state } } } }
    }`,
    { id },
  );
  const body = (await response.json()) as {
    data: {
      employee: {
        personApps: {
          edges: {
            node: {
              app: { id: string; catalogKey: string | null };
              templates: { id: string }[];
              role: string | null;
              roleConflict: boolean;
              state: string | null;
            };
          }[];
        };
      };
    };
  };
  expect(body).not.toHaveProperty("errors");
  return body.data.employee.personApps.edges.map(({ node }) => node);
}
