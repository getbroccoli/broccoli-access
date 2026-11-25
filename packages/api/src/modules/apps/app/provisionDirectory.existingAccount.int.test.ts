import {
  createPersonAtGoogle,
  expect,
  TEST_SECRET_BOX,
  directoryProvisionTest as test,
  linearInvitations,
  NEW_PERSON,
} from "#test/support";
import { accountChanges, directoryChangeRepository } from "../db";

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

test("a retry takes over the account an earlier try created and gives it the password that try stored", async ({
  provisionPerson,
  workspace: { owner, google, linear, provision },
  seed,
  orm,
  fakeGoogle,
}) => {
  const template = await seed.template({ appIds: [linear.appId] });
  const { employeeId, changeId, run } = await provisionPerson({
    templateIds: [template.id],
    appIds: [linear.appId],
  });
  // The earlier delivery stored its password and created the account; Google's answer was lost.
  const stored = TEST_SECRET_BOX.encrypt("first-try-password", changeId);
  await directoryChangeRepository(orm).saveFirstPassword(changeId, stored);
  await createPersonAtGoogle(orm, fakeGoogle.url, owner, NEW_PERSON, {
    creationKey: employeeId,
    changePasswordAtNextLogin: true,
  });

  await run();

  const changes = await orm.select().from(accountChanges);
  expect(changes).toContainEqual(
    expect.objectContaining({ employeeId, connectionId: google.connectionId, status: "succeeded" }),
  );
  expect(changes).toContainEqual(
    expect.objectContaining({ employeeId, appId: linear.appId, action: "invite" }),
  );
  expect(await provision.takeFirstPassword(owner, employeeId)).toEqual({
    email: NEW_PERSON.email,
    password: "first-try-password",
  });
});

test.for([
  [
    "carries another person's key",
    { creationKey: "another-employee", changePasswordAtNextLogin: true },
  ],
  ["is suspended", { changePasswordAtNextLogin: true, suspended: true }],
  ["no longer waits for its first password change", { changePasswordAtNextLogin: false }],
] as const)(
  "a retry refuses an account with the address that %s",
  async (
    [, created],
    { provisionPerson, workspace: { owner, google, linear, provision }, seed, orm, fakeGoogle },
  ) => {
    const template = await seed.template({ appIds: [linear.appId] });
    const { employeeId, run } = await provisionPerson({
      templateIds: [template.id],
      appIds: [linear.appId],
    });
    await createPersonAtGoogle(orm, fakeGoogle.url, owner, NEW_PERSON, {
      creationKey: employeeId,
      ...created,
    });

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
  },
);
