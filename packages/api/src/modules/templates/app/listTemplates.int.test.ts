import { expect, test, OWNER, EMPLOYEE, templates } from "#test/support";

test("lists templates by name ignoring case and shows their apps in the order added", async ({
  orm,
  seed,
}) => {
  const figma = await seed.app({
    name: "Figma",
    domain: "figma.com",
    catalogKey: "figma",
    status: "approved",
  });
  const slack = await seed.app({ status: "approved" });
  const sales = await seed.template({ name: "Sales" });
  const engineering = await seed.template({ name: "engineering", appIds: [slack.id, figma.id] });

  const page = await templates(orm).listTemplates(OWNER, {});

  expect(page.edges).toMatchObject([
    { node: { id: engineering.id, apps: [{ appId: slack.id }, { appId: figma.id }] } },
    { node: { id: sales.id, apps: [] } },
  ]);
});

test("pages through three templates in name order", async ({ orm, seed }) => {
  await seed.template({ name: "Sales" });
  await seed.template({ name: "design" });
  await seed.template({ name: "Engineering" });
  const service = templates(orm);

  const first = await service.listTemplates(OWNER, { first: 1 });
  const second = await service.listTemplates(OWNER, { first: 1, after: first.pageInfo.endCursor });
  const third = await service.listTemplates(OWNER, { first: 1, after: second.pageInfo.endCursor });

  expect(first).toMatchObject({
    edges: [{ node: { name: "design" } }],
    pageInfo: { hasNextPage: true },
  });
  expect(second).toMatchObject({
    edges: [{ node: { name: "Engineering" } }],
    pageInfo: { hasNextPage: true },
  });
  expect(third).toMatchObject({
    edges: [{ node: { name: "Sales" } }],
    pageInfo: { hasNextPage: false },
  });
});

test("counts only the people assigned to each template", async ({ orm, seed }) => {
  const design = await seed.template({ name: "Design" });
  const sales = await seed.template({ name: "Sales" });
  const first = await seed.employee();
  const second = await seed.employee();
  const user = await seed.user({ email: "owner@example.com" });
  await seed.employeeTemplate({ employeeId: first.id, templateId: design.id, assignedBy: user.id });
  await seed.employeeTemplate({
    employeeId: second.id,
    templateId: design.id,
    assignedBy: user.id,
  });
  await seed.employeeTemplate({ employeeId: first.id, templateId: sales.id, assignedBy: user.id });

  const service = templates(orm);
  const page = await service.listTemplates(OWNER, {});

  expect(page.edges).toMatchObject([
    { node: { id: design.id, peopleCount: 2 } },
    { node: { id: sales.id, peopleCount: 1 } },
  ]);
  expect(await service.readTemplate(OWNER, sales.id)).toMatchObject({
    id: sales.id,
    peopleCount: 1,
  });
});

test.for(["00000000-0000-4000-8000-000000000001", "not-an-id"])(
  "returns null for a missing template (%s)",
  async (id, { orm }) => {
    expect(await templates(orm).readTemplate(OWNER, id)).toBeNull();
  },
);

test("refuses to list templates without MANAGE_WORKSPACE", async ({ orm }) => {
  await expect(templates(orm).listTemplates(EMPLOYEE, {})).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

test("refuses to read a template without MANAGE_WORKSPACE", async ({ orm, seed }) => {
  const template = await seed.template();

  await expect(templates(orm).readTemplate(EMPLOYEE, template.id)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
