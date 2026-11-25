import {
  createdGoogleUsers,
  directoryProvisionTest as test,
  expect,
  linearInvitations,
  NEW_PERSON,
  SYSTEM,
} from "#test/support";

test("the owner can retry Linear before the first scan after a late template role conflict", async ({
  provisionPerson,
  workspace: { owner, linear, templates, service, provisionShown },
  seed,
  fakeGoogle,
  fakeConnectors,
}) => {
  const appId = linear.appId;
  const template = await seed.template({ appIds: [appId] });
  const { employeeId, changeId, run } = await provisionPerson({
    templateIds: [template.id],
    appIds: [appId],
  });
  await seed.assignedTemplateApp({
    employeeId,
    appId,
    role: "admin",
    assignedBy: owner.user!.userId,
  });

  await expect(run()).rejects.toMatchObject({ code: "CONFLICT" });

  expect(await createdGoogleUsers(fakeGoogle.url)).toMatchObject([
    { primaryEmail: NEW_PERSON.email },
  ]);
  expect((await service.listAccountChanges(owner, {})).edges).toMatchObject([
    { node: { id: changeId, status: "succeeded" } },
  ]);
  expect(await linearInvitations(fakeConnectors.url, NEW_PERSON.email)).toEqual([]);

  await templates.pickRole(owner, { employeeId, appId, role: "admin" });
  const retry = await provisionShown(employeeId);
  expect(retry).toMatchObject([
    { appId, action: "invite", role: "admin", startedFrom: "provision" },
  ]);
  await service.runChange(SYSTEM, retry[0]!.id);
  expect(await linearInvitations(fakeConnectors.url, NEW_PERSON.email)).toMatchObject([
    { role: "admin" },
  ]);
});
