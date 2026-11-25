import { eq } from "drizzle-orm";
import {
  createPersonAtGoogle,
  expect,
  failFakeGoogle,
  SYSTEM,
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
    },
  ]);
  expect(await provision.takeFirstPassword(owner, employeeId)).toBeNull();
  expect(await linearInvitations(fakeConnectors.url, NEW_PERSON.email)).toEqual([]);
});

test("a redelivered job recognises the account its first delivery created and reveals that password", async ({
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
  // The first delivery stored its password and Google created the account; the answer was lost.
  const stored = TEST_SECRET_BOX.encrypt("first-try-password", changeId);
  await directoryChangeRepository(orm).saveFirstPassword(changeId, stored);
  await createPersonAtGoogle(orm, fakeGoogle.url, owner, NEW_PERSON, { creationKey: employeeId });

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

test("the owner's retry recognises the account an unanswered try created and reveals its password", async ({
  provisionPerson,
  workspace: { owner, provision },
  orm,
  fakeGoogle,
}) => {
  const { employeeId, changeId: firstTry, run } = await provisionPerson();
  await failFakeGoogle(fakeGoogle.url, {
    endpoint: "directory.users.insert",
    error: "authentication_failed",
    count: 1,
  });
  await run();
  const [stored] = await orm
    .select({ encrypted: accountChanges.encryptedFirstPassword })
    .from(accountChanges)
    .where(eq(accountChanges.id, firstTry));
  const firstPassword = TEST_SECRET_BOX.decrypt(stored!.encrypted!, firstTry);
  // Google created it after all, as when its answer was lost.
  await createPersonAtGoogle(orm, fakeGoogle.url, owner, NEW_PERSON, { creationKey: employeeId });

  const [retry] = await provision.provisionEmployee(owner, { employeeId, appIds: [] });
  await provision.runDirectoryProvision(SYSTEM, { changeId: retry!.id, appIds: [] });

  expect(await provision.takeFirstPassword(owner, employeeId)).toEqual({
    email: NEW_PERSON.email,
    password: firstPassword,
  });
});

test.for([
  ["carries another person's key", "another-employee"],
  ["carries this person's key but no earlier try of theirs is known", undefined],
] as const)(
  "a try refuses an account with the address that %s",
  async (
    [, otherKey],
    { provisionPerson, workspace: { owner, google, provision }, orm, fakeGoogle },
  ) => {
    const { employeeId, run } = await provisionPerson();
    await createPersonAtGoogle(orm, fakeGoogle.url, owner, NEW_PERSON, {
      creationKey: otherKey ?? employeeId,
    });

    await run();

    expect(await orm.select().from(accountChanges)).toMatchObject([
      { employeeId, connectionId: google.connectionId, status: "failed", error: "not_allowed" },
    ]);
    expect(await provision.takeFirstPassword(owner, employeeId)).toBeNull();
  },
);
