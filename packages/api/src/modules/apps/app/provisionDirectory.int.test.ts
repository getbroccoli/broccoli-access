import { eq, sql } from "drizzle-orm";
import { assert } from "vitest";
import {
  ADMIN,
  createPersonAtGoogle,
  employeeServices,
  expect,
  failFakeGoogle,
  directoryProvisionTest as test,
  linearInvitations,
  storedAppAccounts,
  storedEmployees,
  SYSTEM,
  TEST_SECRET_BOX,
  addPersonService,
  NEW_PERSON,
} from "#test/support";
import type { Orm } from "../../../core/db";
import { accountChanges } from "../db";

test("a refused Google invite leaves Linear without a change or an invitation", async ({
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
  await failFakeGoogle(fakeGoogle.url, {
    endpoint: "directory.users.insert",
    error: "authentication_failed",
    count: 1,
  });

  await run();

  expect(await orm.select().from(accountChanges)).toMatchObject([
    {
      employeeId,
      connectionId: google.connectionId,
      status: "failed",
      error: "authentication_failed",
    },
  ]);
  expect(await linearInvitations(fakeConnectors.url, NEW_PERSON.email)).toEqual([]);
  expect(await provision.takeFirstPassword(owner, employeeId)).toBeNull();
});

test("a second Provision can invite a newly confirmed app before the first directory scan", async ({
  provisionPerson,
  workspace: { provision, owner, linear, service, google },
  seed,
  orm,
  fakeConnectors,
}) => {
  const template = await seed.template({ appIds: [linear.appId] });
  const { employeeId, changeId, run } = await provisionPerson({ templateIds: [template.id] });
  await run();
  expect(await service.readAccountChange(owner, changeId)).toMatchObject({ status: "succeeded" });

  const changes = await provision.provisionEmployee(owner, { employeeId, appIds: [linear.appId] });

  expect(changes).toMatchObject([
    { appId: linear.appId, action: "invite", startedFrom: "provision" },
  ]);
  await service.runChange(SYSTEM, changes[0]!.id);
  expect(await linearInvitations(fakeConnectors.url, NEW_PERSON.email)).toHaveLength(1);
  expect(
    await orm
      .select({ id: accountChanges.id })
      .from(accountChanges)
      .where(eq(accountChanges.connectionId, google.connectionId)),
  ).toEqual([{ id: changeId }]);
});

test("a direct Linear invite is refused while Google creation is pending and after it fails", async ({
  provisionPerson,
  workspace: { owner, linear, service },
  seed,
  fakeGoogle,
  fakeConnectors,
  orm,
}) => {
  const template = await seed.template({ appIds: [linear.appId] });
  const { employeeId, changeId, run } = await provisionPerson({ templateIds: [template.id] });
  const invite = () => service.inviteEmployee(owner, { employeeId, appId: linear.appId });
  await expect(invite()).rejects.toMatchObject({ code: "CONFLICT" });
  await failFakeGoogle(fakeGoogle.url, {
    endpoint: "directory.users.insert",
    error: "permission_missing",
    count: 1,
  });

  await run();
  expect(await service.readAccountChange(owner, changeId)).toMatchObject({ status: "failed" });

  await expect(invite()).rejects.toMatchObject({ code: "CONFLICT" });
  expect(
    await orm.select().from(accountChanges).where(eq(accountChanges.appId, linear.appId)),
  ).toEqual([]);
  expect(await linearInvitations(fakeConnectors.url, NEW_PERSON.email)).toEqual([]);
});

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

test("the owner cannot mark a failed Google account creation done by hand", async ({
  provisionPerson,
  workspace: { owner, service },
  fakeGoogle,
}) => {
  const { changeId, run } = await provisionPerson();
  await failFakeGoogle(fakeGoogle.url, {
    endpoint: "directory.users.insert",
    error: "permission_missing",
    count: 1,
  });
  await run();
  expect(await service.readAccountChange(owner, changeId)).toMatchObject({ status: "failed" });

  await expect(service.markChangeDoneByHand(owner, changeId)).rejects.toMatchObject({
    code: "CONFLICT",
  });

  expect(await service.readAccountChange(owner, changeId)).toMatchObject({ status: "failed" });
});

test("a newly created Google directory account stays out of app invitations before the next scan", async ({
  provisionPerson,
  workspace: { owner, service },
}) => {
  const { employeeId, changeId, run } = await provisionPerson();
  await run();
  const change = await service.readAccountChange(owner, changeId);
  assert(change?.status === "succeeded", "The directory account must exist");

  const invites = await service.readAppInvites(owner, [employeeId]);

  expect(invites.map(({ appId }) => appId)).not.toContain(change.appId);
});

test("the work email stays fixed after Google creation until the scan matches the directory account", async ({
  provisionPerson,
  workspace: { owner, google, provision },
  orm,
}) => {
  const { employeeId: id, run } = await provisionPerson();
  await run();
  const employees = employeeServices(orm);
  const input = { id, email: "updated@acme.example" };
  await expect(employees.updateEmployee(owner, input)).rejects.toMatchObject({ code: "CONFLICT" });

  await google.scans.scanNow(owner, google.connectionId);
  await google.scans.runScan(SYSTEM, google.sourceId);

  expect(await employees.updateEmployee(owner, input)).toMatchObject({ employee: input });
  const credential = await provision.takeFirstPassword(owner, id);
  expect(credential?.email).toBe(NEW_PERSON.email);
});

test("only one owner request can take the stored password, which stays out of Activity and History", async ({
  provisionPerson,
  workspace: { provision, service, owner, ivan },
  orm,
}) => {
  const { employeeId, changeId, run } = await provisionPerson();
  expect(await provision.takeFirstPassword(owner, employeeId)).toBeNull();
  await run();
  const people = addPersonService(orm);
  expect(await people.readDirectoryProvisions(owner, [employeeId])).toMatchObject([
    { status: "succeeded", firstPasswordAvailable: true },
  ]);
  expect(await people.readDirectoryProvisions(ADMIN, [employeeId])).toEqual([
    { status: null, failure: null, canDelete: false, firstPasswordAvailable: false },
  ]);
  expect(await provision.takeFirstPassword(owner, ivan.id)).toBeNull();
  await expect(provision.takeFirstPassword(ADMIN, employeeId)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  const encrypted = await storedPassword(orm, changeId);
  assert(typeof encrypted === "string");
  const activity = await service.listAccountChanges(owner, {});
  const history = await employeeServices(orm).readEmployeeHistory(owner, employeeId, {});

  const results = await Promise.all([
    provision.takeFirstPassword(owner, employeeId),
    provision.takeFirstPassword(owner, employeeId),
  ]);

  const revealed = results.find((value) => value !== null);
  assert(revealed, "One request must receive the password");
  const { email, password } = revealed;
  expect(email).toBe(NEW_PERSON.email);
  expect(results).toContain(null);
  expect(TEST_SECRET_BOX.decrypt(encrypted, changeId)).toBe(password);
  for (const visible of [activity, history]) {
    expect(JSON.stringify(visible)).not.toContain(password);
    expect(JSON.stringify(visible)).not.toContain(encrypted);
  }
  expect(await storedPassword(orm, changeId)).toBeNull();
});

test("an owner cannot take a password after seven days even before cleanup", async ({
  provisionPerson,
  workspace: { owner, provision },
  orm,
}) => {
  const { employeeId, changeId, run } = await provisionPerson();
  await run();
  expect(await storedPassword(orm, changeId)).toEqual(expect.any(String));
  await setChangeAge(orm, changeId, "7 days 1 minute");

  expect(await provision.takeFirstPassword(owner, employeeId)).toBeNull();
});

test("cleanup clears only unread passwords at least seven days old", async ({
  provisionPerson,
  workspace: { owner, provision },
  orm,
}) => {
  const older = await provisionPerson();
  await older.run();
  const newer = await provisionPerson({ email: "alex@acme.example" });
  await newer.run();
  expect(await storedPassword(orm, older.changeId)).toEqual(expect.any(String));
  await setChangeAge(orm, older.changeId, "7 days 1 minute");
  await setChangeAge(orm, newer.changeId, "6 days 23 hours 59 minutes");

  await provision.expireFirstPasswords(SYSTEM);

  expect(await storedPassword(orm, older.changeId)).toBeNull();
  expect(await provision.takeFirstPassword(owner, newer.employeeId)).toEqual({
    email: "alex@acme.example",
    password: expect.any(String) as unknown,
  });
});

test("the next scan matches the provisioned directory account to the original employee", async ({
  provisionPerson,
  workspace: { google, owner },
  orm,
}) => {
  const { employeeId, run } = await provisionPerson();
  await run();
  const people = addPersonService(orm);
  await expect(people.deletePerson(owner, employeeId)).rejects.toMatchObject({ code: "CONFLICT" });

  await google.scans.scanNow(owner, google.connectionId);
  await google.scans.runScan(SYSTEM, google.sourceId);

  expect(
    (await storedEmployees(orm)).filter(({ email }) => email === NEW_PERSON.email),
  ).toMatchObject([{ ...NEW_PERSON, id: employeeId }]);
  expect(
    (await storedAppAccounts(orm)).filter(({ email }) => email === NEW_PERSON.email),
  ).toMatchObject([{ employeeId, status: "active", foundVia: ["google_directory"] }]);
  const history = await employeeServices(orm).readEmployeeHistory(owner, employeeId, {});
  expect(history.edges.some(({ node }) => node.cause.kind === "FOUND_BY_SCAN")).toBe(true);
});

async function storedPassword(orm: Orm, changeId: string) {
  const [row] = await orm
    .select({ encrypted: accountChanges.encryptedFirstPassword })
    .from(accountChanges)
    .where(eq(accountChanges.id, changeId));
  return row!.encrypted;
}

async function setChangeAge(orm: Orm, changeId: string, ageAtFinish: string) {
  await orm
    .update(accountChanges)
    .set({
      requestedAt: sql`now() - interval '8 days'`,
      finishedAt: sql`now() - ${ageAtFinish}::interval`,
    })
    .where(eq(accountChanges.id, changeId));
}
