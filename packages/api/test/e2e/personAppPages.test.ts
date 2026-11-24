import { type Browser, expect, test } from "#test/support";

test("pages a person's assignments and apps by their own ids and keeps every source of an app", async ({
  env,
}) => {
  const { browser, user } = await env.signInAsOwner();
  const employee = await env.seed.employee();
  const design = await env.seed.app({
    name: "Studio",
    catalogKey: null,
    domain: "studio.example",
    status: "approved",
  });
  const tasks = await env.seed.app({
    name: "Boards",
    catalogKey: null,
    domain: "boards.example",
    status: "approved",
  });
  const engineer = await env.seed.template({ name: "Engineer", appIds: [tasks.id, design.id] });
  const analyst = await env.seed.template({ name: "Analyst", appIds: [design.id] });
  for (const template of [analyst, engineer]) {
    await env.seed.employeeTemplate({
      templateId: template.id,
      employeeId: employee.id,
      assignedBy: user.id,
    });
  }

  const first = await readPage(browser, employee.id, null, null);
  expect(first.templates.edges).toEqual([{ node: { id: engineer.id } }]);
  expect(first.personApps.edges).toHaveLength(1);
  const shared = first.personApps.edges[0]!.node;
  expect(shared.app.id).toBe(design.id);
  expect(shared.templates.map(({ id }) => id).sort()).toEqual([analyst.id, engineer.id].sort());
  expect(first.templates.pageInfo.hasNextPage).toBe(true);
  expect(first.personApps.pageInfo.hasNextPage).toBe(true);

  const last = await readPage(
    browser,
    employee.id,
    first.templates.pageInfo.endCursor,
    first.personApps.pageInfo.endCursor,
  );
  expect(last.templates.edges).toEqual([{ node: { id: analyst.id } }]);
  expect(last.personApps.edges).toEqual([
    { node: { app: { id: tasks.id }, templates: [{ id: engineer.id }] } },
  ]);
  expect(last.templates.pageInfo.hasNextPage).toBe(false);
  expect(last.personApps.pageInfo.hasNextPage).toBe(false);
});

test("the first picker page skips assigned templates before applying its limit", async ({
  env,
}) => {
  const { browser, user } = await env.signInAsOwner();
  const employee = await env.seed.employee();
  const assigned = await env.seed.template({ name: "Analyst" });
  const eligible = await env.seed.template({ name: "Engineer" });
  await env.seed.employeeTemplate({
    templateId: assigned.id,
    employeeId: employee.id,
    assignedBy: user.id,
  });

  const response = await browser.graphql(
    `query ($id: ID!) {
    templates(first: 1, assignableTo: $id) { edges { node { id } } pageInfo { hasNextPage } }
  }`,
    { id: employee.id },
  );

  expect(await response.json()).toEqual({
    data: {
      templates: {
        edges: [{ node: { id: eligible.id } }],
        pageInfo: { hasNextPage: false },
      },
    },
  });
});

async function readPage(
  browser: Browser,
  id: string,
  afterTemplate: string | null,
  afterApp: string | null,
) {
  const response = await browser.graphql(
    `query ($id: ID!, $afterTemplate: String, $afterApp: String) {
    employee(id: $id) {
      templates(first: 1, after: $afterTemplate) { edges { node { id } } pageInfo { hasNextPage endCursor } }
      personApps(first: 1, after: $afterApp) { edges { node { app { id } templates { id } } } pageInfo { hasNextPage endCursor } }
    }
  }`,
    { id, afterTemplate, afterApp },
  );
  const body = (await response.json()) as {
    data: {
      employee: {
        templates: Page<{ id: string }>;
        personApps: Page<{ app: { id: string }; templates: { id: string }[] }>;
      };
    };
  };
  expect(body).not.toHaveProperty("errors");
  return body.data.employee;
}

interface Page<Node> {
  edges: { node: Node }[];
  pageInfo: { endCursor: string | null; hasNextPage: boolean };
}
