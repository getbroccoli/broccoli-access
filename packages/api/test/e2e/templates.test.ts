import { expect, test } from "#test/support";

test("the owner creates a template, changes its apps and name, lists it and deletes it", async ({
  env,
}) => {
  const { browser } = await env.signInAsOwner();
  const { id: studioId, name } = await env.seed.app({
    name: "Studio",
    domain: "studio.example",
    catalogKey: null,
    status: "approved",
  });
  const studio = { id: studioId, name };

  const created = await browser.graphql(
    'mutation { templates { create(input: { name: "Engineer" }) { template { id name } error { __typename } } } }',
  );
  const body = (await created.json()) as {
    data: { templates: { create: { template: { id: string } } } };
  };
  expect(body).toEqual({
    data: {
      templates: {
        create: { template: { id: expect.any(String) as unknown, name: "Engineer" }, error: null },
      },
    },
  });
  const { id } = body.data.templates.create.template;

  const added = await browser.graphql(
    "mutation ($input: TemplateAddAppInput!) { templates { addApp(input: $input) { template { apps { id app { id name } } } error { __typename } } } }",
    { input: { id, appId: studio.id } },
  );
  expect(await added.json()).toEqual({
    data: {
      templates: {
        addApp: {
          template: { apps: [{ id: expect.any(String) as unknown, app: studio }] },
          error: null,
        },
      },
    },
  });

  const renamed = await browser.graphql(
    "mutation ($input: TemplateUpdateInput!) { templates { update(input: $input) { template { name } error { __typename } } } }",
    { input: { id, name: "Developer" } },
  );
  expect(await renamed.json()).toEqual({
    data: { templates: { update: { template: { name: "Developer" }, error: null } } },
  });

  const removed = await browser.graphql(
    "mutation ($input: TemplateTakeOutAppInput!) { templates { takeOutApp(input: $input) { template { apps { id } } error { __typename } } } }",
    { input: { id, appId: studio.id } },
  );
  expect(await removed.json()).toEqual({
    data: { templates: { takeOutApp: { template: { apps: [] }, error: null } } },
  });

  const listed = await browser.graphql(
    "query ($id: ID!) { template(id: $id) { id name } templates { edges { node { id name createdAt peopleCount apps { id } } } } }",
    { id },
  );
  expect(await listed.json()).toEqual({
    data: {
      template: { id, name: "Developer" },
      templates: {
        edges: [
          {
            node: {
              id,
              name: "Developer",
              createdAt: expect.any(String) as unknown,
              peopleCount: 0,
              apps: [],
            },
          },
        ],
      },
    },
  });

  const deleted = await browser.graphql(
    "mutation ($input: TemplateDeleteInput!) { templates { delete(input: $input) { error { __typename } } } }",
    { input: { id } },
  );
  expect(await deleted.json()).toEqual({ data: { templates: { delete: { error: null } } } });

  const afterDelete = await browser.graphql("query ($id: ID!) { template(id: $id) { id } }", {
    id,
  });
  expect(await afterDelete.json()).toEqual({ data: { template: null } });
});

test("returns the taken name in the create template error payload", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const create = `mutation ($name: String!) {
    templates { create(input: { name: $name }) {
      template { name }
      error { __typename ... on InvalidInputError { fields { field code } } }
    } }
  }`;
  const first = await browser.graphql(create, { name: "Engineer" });
  expect(await first.json()).toEqual({
    data: { templates: { create: { template: { name: "Engineer" }, error: null } } },
  });

  const duplicate = await browser.graphql(create, { name: "engineer" });

  expect(await duplicate.json()).toEqual({
    data: {
      templates: {
        create: {
          template: null,
          error: { __typename: "InvalidInputError", fields: [{ field: "name", code: "taken" }] },
        },
      },
    },
  });
});

test.for([
  ["template", '{ template(id: "1") { id } }'],
  ["templates", "{ templates { edges { node { id } } } }"],
  [
    "templates.create",
    'mutation { templates { create(input: { name: "Engineer" }) { template { id } } } }',
  ],
  [
    "templates.update",
    'mutation { templates { update(input: { id: "1", name: "Developer" }) { template { id } } } }',
  ],
  [
    "templates.delete",
    'mutation { templates { delete(input: { id: "1" }) { error { __typename } } } }',
  ],
  [
    "templates.addApp",
    'mutation { templates { addApp(input: { id: "1", appId: "2" }) { template { id } } } }',
  ],
  [
    "templates.takeOutApp",
    'mutation { templates { takeOutApp(input: { id: "1", appId: "2" }) { template { id } } } }',
  ],
  [
    "templates.assign",
    'mutation { templates { assign(input: { id: "1", employeeId: "2" }) { template { id } } } }',
  ],
  [
    "templates.takeOff",
    'mutation { templates { takeOff(input: { id: "1", employeeId: "2" }) { template { id } } } }',
  ],
] as const)("refuses %s without a session", async ([, query], { env }) => {
  await env.signInAsOwner();

  const response = await env.browser().graphql(query);

  expect(response.status).toBe(200);
  expect(await response.json()).toHaveProperty("errors.0.extensions", {
    code: "UNAUTHENTICATED",
    fieldErrors: [],
  });
});

test("refuses an over-budget membership page even when the template has no people", async ({
  env,
}) => {
  const { browser } = await env.signInAsOwner();
  const template = await env.seed.template();

  const response = await browser.graphql(
    "query ($id: ID!) { template(id: $id) { people(first: 10001) { pageInfo { hasNextPage } } } }",
    { id: template.id },
  );

  expect(await response.json()).toMatchObject({
    data: { template: null },
    errors: [
      { path: ["template", "people"], message: "Request fewer template members at a time." },
    ],
  });
});

test("the owner sees who is missing an app and keeps another person's extra account", async ({
  env,
}) => {
  const { browser, user } = await env.signInAsOwner();
  const assigned = await env.seed.employee();
  const formerMember = await env.seed.employee();
  const app = await env.seed.app({
    name: "Studio",
    domain: "studio.example",
    catalogKey: null,
    status: "approved",
  });
  await env.seed.appConnection({ appId: app.id, connector: "linear" });
  const template = await env.seed.assignedTemplateApp({
    employeeId: assigned.id,
    appId: app.id,
    role: null,
    assignedBy: user.id,
  });
  const pair = { employeeId: formerMember.id, appId: app.id };
  await env.seed.appAccount(pair);
  await env.seed.employeeAppChoice({ ...pair, choice: "to_review" });

  const differences = await browser.graphql(
    `
    query ($id: ID!) {
      template(id: $id) { differenceSummary { missingCount extraCount missingApp { id } } }
      accessDifferences {
        missing { employee { id } app { id } }
        extra { employee { id } app { id } }
      }
    }`,
    { id: template.id },
  );
  expect(await differences.json()).toEqual({
    data: {
      template: {
        differenceSummary: { missingCount: 1, extraCount: 0, missingApp: { id: app.id } },
      },
      accessDifferences: {
        missing: [{ employee: { id: assigned.id }, app: { id: app.id } }],
        extra: [{ employee: { id: formerMember.id }, app: { id: app.id } }],
      },
    },
  });

  const kept = await browser.graphql(
    `
    mutation ($employeeId: ID!, $appId: ID!) {
      templates { keepExtraApp(input: { employeeId: $employeeId, appId: $appId }) {
        employee { id } error { __typename }
      } }
    }`,
    pair,
  );
  expect(await kept.json()).toEqual({
    data: { templates: { keepExtraApp: { employee: { id: formerMember.id }, error: null } } },
  });
});

test("refuses employee history nested under missing access differences", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const employee = await env.seed.employee();
  const app = await env.seed.app({
    name: "Studio",
    domain: "studio.example",
    catalogKey: null,
    status: "approved",
  });
  await env.seed.appConnection({ appId: app.id, connector: "linear" });
  await env.seed.employeeAppChoice({ employeeId: employee.id, appId: app.id, choice: "added" });

  const response = await browser.graphql(`{
    accessDifferences { missing { employee { history(first: 1) { pageInfo { hasNextPage } } } } }
  }`);

  expect(await response.json()).toMatchObject({
    errors: [
      {
        path: ["accessDifferences", "missing", 0, "employee", "history"],
        extensions: { code: "INVALID_INPUT" },
        message: "Read employee history from a person’s own query.",
      },
    ],
  });
});
