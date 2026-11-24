import {
  expect,
  test,
  OWNER,
  EMPLOYEE,
  templates,
  storedTemplates,
  storedTemplateApps,
  storedEmployeeTemplates,
  storedRecordHistory,
} from "#test/support";

test("deletes the template with its apps and assignments and keeps its deletion history", async ({
  orm,
  seed,
}) => {
  const app = await seed.app({ status: "approved" });
  const engineer = await seed.template({ name: "Engineer", appIds: [app.id] });
  const designer = await seed.template({ name: "Designer", appIds: [app.id] });
  const employee = await seed.employee();
  const user = await seed.user({ email: "owner@example.com" });
  const assignment = { employeeId: employee.id, assignedBy: user.id };
  await seed.employeeTemplate({ ...assignment, templateId: engineer.id });
  const kept = await seed.employeeTemplate({ ...assignment, templateId: designer.id });

  await templates(orm).deleteTemplate(OWNER, engineer.id);

  expect(await storedTemplates(orm)).toEqual([designer]);
  expect(await storedTemplateApps(orm)).toMatchObject([{ templateId: designer.id, appId: app.id }]);
  expect(await storedEmployeeTemplates(orm)).toEqual([kept]);
  expect(await storedRecordHistory(orm)).toMatchObject([
    {
      recordType: "template",
      recordId: engineer.id,
      operation: "deleted",
      authorKind: "signed_in_user",
      authorId: "test-owner",
      causeKind: "edited_directly",
      changes: [{ field: "name", oldValue: "Engineer", newValue: null }],
    },
  ]);
});

test.for(["00000000-0000-4000-8000-000000000001", "not-an-id"])(
  "refuses to delete a missing template (%s)",
  async (id, { orm }) => {
    await expect(templates(orm).deleteTemplate(OWNER, id)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "No template has this id.",
    });
  },
);

test("refuses to delete a template without MANAGE_WORKSPACE", async ({ orm, seed }) => {
  const template = await seed.template();

  await expect(templates(orm).deleteTemplate(EMPLOYEE, template.id)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect(await storedTemplates(orm)).toEqual([template]);
  expect(await storedRecordHistory(orm)).toEqual([]);
});
