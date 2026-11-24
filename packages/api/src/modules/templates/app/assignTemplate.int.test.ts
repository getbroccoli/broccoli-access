import {
  EMPLOYEE,
  OWNER,
  expect,
  storedEmployeeTemplates,
  storedRecordHistory,
  templates,
  test,
  type TestSeed,
} from "#test/support";

test("assigns a template once and takes it off once, recording both changes on the employee", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner();
  const employee = await directoryEmployee(seed, "active");
  const template = await seed.template();
  const input = { id: template.id, employeeId: employee.id };
  const service = templates(orm);

  const assigned = await service.assign(owner, input);
  expect(assigned).toMatchObject({ id: template.id, peopleCount: 1 });
  expect(await service.assign(owner, input)).toEqual(assigned);
  expect(await storedEmployeeTemplates(orm)).toMatchObject([
    { employeeId: employee.id, templateId: template.id, assignedBy: owner.user!.userId },
  ]);

  const removed = await service.takeOff(owner, input);
  expect(removed).toMatchObject({ id: template.id, peopleCount: 0 });
  expect(await service.takeOff(owner, input)).toEqual(removed);
  expect(await storedEmployeeTemplates(orm)).toEqual([]);
  const line = {
    recordType: "employee",
    recordId: employee.id,
    operation: "updated",
    authorId: owner.user!.userId,
    authorKind: "signed_in_user",
    causeKind: "edited_directly",
  };
  expect(await storedRecordHistory(orm)).toMatchObject([
    {
      ...line,
      changes: [
        { field: "template", oldValue: null, newValue: template.id, newLabel: template.name },
      ],
    },
    {
      ...line,
      changes: [
        { field: "template", oldValue: template.id, oldLabel: template.name, newValue: null },
      ],
    },
  ]);
});

test.for(["suspended", "absent"] as const)(
  "preserves existing assignments and refuses a new one when the directory account is %s",
  async (status, { orm, seed }) => {
    const owner = await seed.owner();
    const employee =
      status === "absent" ? await seed.employee() : await directoryEmployee(seed, status);
    const existing = await seed.template();
    const next = await seed.template();
    const kept = await seed.employeeTemplate({
      employeeId: employee.id,
      templateId: existing.id,
      assignedBy: owner.user!.userId,
    });

    await expect(
      templates(orm).assign(owner, { id: next.id, employeeId: employee.id }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "employeeId", code: "invalid" }],
    });
    expect(await storedEmployeeTemplates(orm)).toEqual([kept]);
    expect(await storedRecordHistory(orm)).toEqual([]);
  },
);

test.for(["assign", "takeOff"] as const)(
  "%s refuses a missing employee or template",
  async (operation, { orm, seed }) => {
    const owner = await seed.owner();
    const employee = await directoryEmployee(seed, "active");
    const template = await seed.template();
    const service = templates(orm);
    const missing = "00000000-0000-4000-8000-000000000001";

    await expect(
      service[operation](owner, { id: missing, employeeId: employee.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service[operation](owner, { id: template.id, employeeId: missing }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await storedRecordHistory(orm)).toEqual([]);
  },
);

test.for(["assign", "takeOff"] as const)(
  "%s requires permission to manage the workspace",
  async (operation, { orm, seed }) => {
    const employee = await directoryEmployee(seed, "active");
    const template = await seed.template();

    await expect(
      templates(orm)[operation](EMPLOYEE, { id: template.id, employeeId: employee.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await storedRecordHistory(orm)).toEqual([]);
  },
);

test("reads assignments in the requested employee and template order, including empty groups", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner();
  const ivan = await seed.employee();
  const ana = await seed.employee();
  const ben = await seed.employee();
  const engineer = await seed.template({ name: "Engineer" });
  const design = await seed.template({ name: "Design" });
  const empty = await seed.template();
  const assignedBy = owner.user!.userId;
  await seed.employeeTemplate({ employeeId: ivan.id, templateId: engineer.id, assignedBy });
  await seed.employeeTemplate({ employeeId: ana.id, templateId: design.id, assignedBy });
  const service = templates(orm);

  expect(await service.readEmployeeTemplates(OWNER, [ana.id, ben.id, ivan.id])).toMatchObject([
    [{ id: design.id, peopleCount: 1 }],
    [],
    [{ id: engineer.id, peopleCount: 1 }],
  ]);
  expect(await service.readTemplatePeople(OWNER, [engineer.id, empty.id, design.id])).toEqual([
    [ivan.id],
    [],
    [ana.id],
  ]);
});

async function directoryEmployee(seed: TestSeed, status: "active" | "suspended") {
  const directory = await seed.app({
    name: "Google Workspace",
    domain: "google.com",
    catalogKey: "google_workspace",
    status: "approved",
  });
  await seed.appConnection({ appId: directory.id, connector: "google_workspace" });
  const employee = await seed.employee();
  await seed.appAccount({
    appId: directory.id,
    employeeId: employee.id,
    email: employee.email,
    status,
    foundVia: ["google_directory"],
  });
  return employee;
}
