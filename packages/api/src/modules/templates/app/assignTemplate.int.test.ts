import {
  EMPLOYEE,
  OWNER,
  connectedWorkspace,
  expect,
  expectBlockedBy,
  holdBeforeCommit,
  scans,
  storedEmployees,
  suspendAtFakeGoogle,
  SYSTEM,
  templateReviewTransactor,
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
      message: "Only a person active in the directory can be assigned a template.",
      fieldErrors: [{ field: "employeeId", code: "invalid" }],
    });
    expect(await storedEmployeeTemplates(orm)).toEqual([kept]);
    expect(await storedRecordHistory(orm)).toEqual([]);
  },
);

test("an assignment waiting for a directory suspension refuses the newly suspended employee", async ({
  orm,
  seed,
  fakeGoogle,
}) => {
  const google = await connectedWorkspace(orm, fakeGoogle.url);
  const employee = (await storedEmployees(orm)).find(
    ({ email }) => email === "chloe@acme.example",
  )!;
  const template = await seed.template();
  await suspendAtFakeGoogle(fakeGoogle.url, employee.email);
  await google.scans.scanNow(google.ctx, google.connectionId);
  const held = holdBeforeCommit(templateReviewTransactor(orm));
  const directory = scans(orm, { googleUrl: fakeGoogle.url, transact: held.transact });
  const saving = directory.runScan(SYSTEM, google.sourceId);
  const pid = await held.ready;

  const assignment = templates(orm).assign(google.ctx, {
    id: template.id,
    employeeId: employee.id,
  });
  const result = Promise.allSettled([assignment]);
  try {
    await expectBlockedBy(orm, pid);
  } finally {
    held.release();
    await Promise.all([saving, result]);
  }

  expect(await result).toMatchObject([
    {
      status: "rejected",
      reason: {
        code: "INVALID_INPUT",
        fieldErrors: [{ field: "employeeId", code: "invalid" }],
      },
    },
  ]);
  expect(await storedEmployeeTemplates(orm)).toEqual([]);
});

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

test("reads templates in the requested employee order, including empty groups", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner();
  const ivan = await seed.employee();
  const ana = await seed.employee();
  const ben = await seed.employee();
  const engineer = await seed.template({ name: "Engineer" });
  const design = await seed.template({ name: "Design" });
  const assignedBy = owner.user!.userId;
  await seed.employeeTemplate({ employeeId: ivan.id, templateId: engineer.id, assignedBy });
  await seed.employeeTemplate({ employeeId: ana.id, templateId: design.id, assignedBy });
  const service = templates(orm);

  expect(await service.readEmployeeTemplates(OWNER, [ana.id, ben.id, ivan.id])).toMatchObject([
    [{ id: design.id, peopleCount: 1 }],
    [],
    [{ id: engineer.id, peopleCount: 1 }],
  ]);
});

test("pages a template's people in assignment order across the first six", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner();
  const engineer = await seed.template();
  const everyone = await seed.template();
  const assignedBy = owner.user!.userId;
  const employeeIds: string[] = [];
  for (const firstName of ["Ana", "Ben", "Chloé", "David", "Elif", "Gabriel", "Ivan"]) {
    employeeIds.push((await seed.employee({ firstName })).id);
  }
  const outsider = await seed.employee();
  await seed.employeeTemplate({ templateId: everyone.id, employeeId: outsider.id, assignedBy });
  const assigned = employeeIds.toReversed();
  for (const employeeId of assigned) {
    await seed.employeeTemplate({ templateId: engineer.id, employeeId, assignedBy });
  }
  const service = templates(orm);

  const first = await service.readTemplatePeople(OWNER, engineer.id, { first: 6 });
  expect(first.edges.map(({ node }) => node)).toEqual(assigned.slice(0, 6));
  expect(first.pageInfo.hasNextPage).toBe(true);
  const last = await service.readTemplatePeople(OWNER, engineer.id, {
    first: 6,
    after: first.pageInfo.endCursor,
  });
  expect(last.edges.map(({ node }) => node)).toEqual(assigned.slice(6));
  expect(last.pageInfo.hasNextPage).toBe(false);
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
