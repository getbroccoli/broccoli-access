import {
  expect,
  test,
  OWNER,
  EMPLOYEE,
  templates,
  storedTemplates,
  storedRecordHistory,
} from "#test/support";

test("creates a template with its trimmed name and records who created it", async ({ orm }) => {
  const template = await templates(orm).createTemplate(OWNER, { name: "  Engineer  " });

  expect(template).toMatchObject({
    name: "Engineer",
    apps: [],
    peopleCount: 0,
    createdAt: expect.any(Date) as unknown,
  });
  expect(await storedTemplates(orm)).toEqual([
    { id: template.id, name: "Engineer", createdAt: template.createdAt },
  ]);
  expect(await storedRecordHistory(orm)).toMatchObject([
    {
      recordType: "template",
      recordId: template.id,
      operation: "created",
      authorKind: "signed_in_user",
      authorId: "test-owner",
      causeKind: "edited_directly",
      changes: [{ field: "name", oldValue: null, newValue: "Engineer" }],
    },
  ]);
});

test.for([
  ["blank", "   ", "required"],
  ["too long", "a".repeat(101), "too_long"],
] as const)("refuses a template name that is %s", async ([, name, code], { orm }) => {
  await expect(templates(orm).createTemplate(OWNER, { name })).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code }],
  });
  expect(await storedTemplates(orm)).toEqual([]);
  expect(await storedRecordHistory(orm)).toEqual([]);
});

test.for(["Engineer", "engineer"])(
  "refuses the taken template name %s",
  async (name, { orm, seed }) => {
    const existing = await seed.template({ name: "Engineer" });

    await expect(templates(orm).createTemplate(OWNER, { name })).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "name", code: "taken" }],
    });
    expect(await storedTemplates(orm)).toEqual([existing]);
    expect(await storedRecordHistory(orm)).toEqual([]);
  },
);

test("refuses to create a template without MANAGE_WORKSPACE", async ({ orm }) => {
  await expect(templates(orm).createTemplate(EMPLOYEE, { name: "Engineer" })).rejects.toMatchObject(
    { code: "FORBIDDEN" },
  );
  expect(await storedTemplates(orm)).toEqual([]);
  expect(await storedRecordHistory(orm)).toEqual([]);
});
