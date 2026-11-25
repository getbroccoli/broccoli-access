import {
  addPersonService,
  ADMIN,
  directoryProvisionTest as test,
  employeeServices,
  expect,
  failFakeGoogle,
  NEW_PERSON,
} from "#test/support";

test("an admin sees that a person is awaiting the directory without the owner's action details", async ({
  provisionPerson,
  workspace: { owner, service, ivan },
  orm,
  fakeGoogle,
}) => {
  const { employeeId, run } = await provisionPerson();
  await failFakeGoogle(fakeGoogle.url, {
    endpoint: "directory.users.insert",
    error: "permission_missing",
    count: 1,
  });
  await run();
  const people = addPersonService(orm);
  expect(await people.readDirectoryProvisions(owner, [employeeId])).toEqual([
    {
      status: "failed",
      failure: "permission_missing",
      canDelete: true,
      firstPasswordAvailable: false,
    },
  ]);

  expect(await people.readDirectoryProvisions(ADMIN, [employeeId, ivan.id])).toEqual([
    { status: null, failure: null, canDelete: false, firstPasswordAvailable: false },
    null,
  ]);
  expect(await service.readOffboardings(ADMIN, [employeeId])).toMatchObject([
    { directoryAccount: null },
  ]);
  await expect(service.offboardEmployee(ADMIN, { employeeId, appIds: [] })).rejects.toMatchObject({
    code: "CONFLICT",
  });
  await expect(people.deletePerson(ADMIN, employeeId)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("a pending person with a direct report cannot be deleted", async ({
  orm,
  seed,
  workspace: { owner },
}) => {
  const people = addPersonService(orm);
  const { id: employeeId } = await people.addPerson(owner, { ...NEW_PERSON, templateIds: [] });
  expect(await people.readDirectoryProvisions(owner, [employeeId])).toMatchObject([
    { canDelete: true },
  ]);
  const report = await seed.employee({ managerId: employeeId });

  await expect(people.deletePerson(owner, employeeId)).rejects.toMatchObject({ code: "CONFLICT" });

  expect(await people.readDirectoryProvisions(owner, [employeeId])).toMatchObject([
    { canDelete: false },
  ]);
  expect(await employeeServices(orm).readEmployee(owner, report.id)).toMatchObject({
    managerId: employeeId,
  });
});
