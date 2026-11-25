import {
  createPersonAtGoogle,
  expect,
  directoryProvisionTest as test,
  linearInvitations,
  NEW_PERSON,
} from "#test/support";
import { accountChanges } from "../db";

test("a Google account created independently causes a duplicate refusal and releases no apps or password", async ({
  provisionPerson,
  workspace: { owner, google, linear, provision },
  seed,
  orm,
  fakeGoogle,
  fakeConnectors,
}) => {
  const template = await seed.template({ appIds: [linear.appId] });
  const { employeeId, run } = await provisionPerson({
    templateIds: [template.id],
    appIds: [linear.appId],
  });
  await createPersonAtGoogle(orm, fakeGoogle.url, owner, NEW_PERSON);

  await run();

  expect(await orm.select().from(accountChanges)).toMatchObject([
    {
      employeeId,
      connectionId: google.connectionId,
      status: "failed",
      error: "not_allowed",
      encryptedFirstPassword: null,
    },
  ]);
  expect(await provision.takeFirstPassword(owner, employeeId)).toBeNull();
  expect(await linearInvitations(fakeConnectors.url, NEW_PERSON.email)).toEqual([]);
});

test("a retry takes over the Google account an earlier try created and gives it a new password", async ({
  provisionPerson,
  workspace: { owner, google, linear, provision },
  seed,
  orm,
  fakeGoogle,
}) => {
  const template = await seed.template({ appIds: [linear.appId] });
  const { employeeId, run } = await provisionPerson({
    templateIds: [template.id],
    appIds: [linear.appId],
  });
  await createPersonAtGoogle(orm, fakeGoogle.url, owner, NEW_PERSON, employeeId);

  await run();

  const changes = await orm.select().from(accountChanges);
  expect(changes).toContainEqual(
    expect.objectContaining({ employeeId, connectionId: google.connectionId, status: "succeeded" }),
  );
  // The other confirmed apps are released, as after a first creation.
  expect(changes).toContainEqual(
    expect.objectContaining({ employeeId, appId: linear.appId, action: "invite" }),
  );
  expect(await provision.takeFirstPassword(owner, employeeId)).toEqual({
    email: NEW_PERSON.email,
    password: expect.any(String) as unknown,
  });
});
