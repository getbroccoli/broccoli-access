import {
  expect,
  test,
  OWNER,
  EMPLOYEE,
  templates,
  storedTemplates,
  storedRecordHistory,
} from "#test/support";

test("renames the template and records the caller's change", async ({ orm, seed }) => {
  const template = await seed.template({ name: "Engineer" });

  const renamed = await templates(orm).updateTemplate(OWNER, {
    id: template.id,
    name: "  Developer  ",
  });

  expect(renamed).toMatchObject({ id: template.id, name: "Developer" });
  expect(await storedTemplates(orm)).toEqual([{ ...template, name: "Developer" }]);
  expect(await storedRecordHistory(orm)).toMatchObject([
    {
      recordType: "template",
      recordId: template.id,
      operation: "updated",
      authorKind: "signed_in_user",
      authorId: "test-owner",
      causeKind: "edited_directly",
      changes: [{ field: "name", oldValue: "Engineer", newValue: "Developer" }],
    },
  ]);
});

test("replaces a lone surrogate in the renamed template's name and history", async ({
  orm,
  seed,
}) => {
  const template = await seed.template({ name: "Engineer" });

  const renamed = await templates(orm).updateTemplate(OWNER, { id: template.id, name: "\ud800" });

  expect(renamed.name).toBe("�");
  expect(await storedTemplates(orm)).toEqual([{ ...template, name: "�" }]);
  expect(await storedRecordHistory(orm)).toMatchObject([
    { recordId: template.id, changes: [{ field: "name", oldValue: "Engineer", newValue: "�" }] },
  ]);
});

test.for([{ name: "Engineer" }, {}])(
  "keeps an unchanged name without adding history (%j)",
  async (input, { orm, seed }) => {
    const template = await seed.template({ name: "Engineer" });

    const unchanged = await templates(orm).updateTemplate(OWNER, { id: template.id, ...input });

    expect(unchanged).toMatchObject(template);
    expect(await storedTemplates(orm)).toEqual([template]);
    expect(await storedRecordHistory(orm)).toEqual([]);
  },
);

test("allows a template to change the case of its own name", async ({ orm, seed }) => {
  const template = await seed.template({ name: "Engineer" });

  const renamed = await templates(orm).updateTemplate(OWNER, { id: template.id, name: "ENGINEER" });

  expect(renamed.name).toBe("ENGINEER");
  expect(await storedTemplates(orm)).toEqual([{ ...template, name: "ENGINEER" }]);
});

test("refuses to rename a template to another template's name ignoring case", async ({
  orm,
  seed,
}) => {
  const engineer = await seed.template({ name: "Engineer" });
  const designer = await seed.template({ name: "Designer" });

  await expect(
    templates(orm).updateTemplate(OWNER, { id: designer.id, name: "engineer" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code: "taken" }],
  });
  expect(await storedTemplates(orm)).toEqual([engineer, designer]);
  expect(await storedRecordHistory(orm)).toEqual([]);
});

test("refuses to clear the template name", async ({ orm, seed }) => {
  const template = await seed.template();

  await expect(
    templates(orm).updateTemplate(OWNER, { id: template.id, name: null }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code: "required" }],
  });
  expect(await storedTemplates(orm)).toEqual([template]);
  expect(await storedRecordHistory(orm)).toEqual([]);
});

test.for(["00000000-0000-4000-8000-000000000001", "not-an-id"])(
  "refuses to rename a missing template (%s)",
  async (id, { orm }) => {
    await expect(
      templates(orm).updateTemplate(OWNER, { id, name: "Engineer" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "No template has this id.",
    });
  },
);

test("refuses to rename a template without MANAGE_WORKSPACE", async ({ orm, seed }) => {
  const template = await seed.template();

  await expect(
    templates(orm).updateTemplate(EMPLOYEE, { id: template.id, name: "Engineer" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await storedTemplates(orm)).toEqual([template]);
  expect(await storedRecordHistory(orm)).toEqual([]);
});
