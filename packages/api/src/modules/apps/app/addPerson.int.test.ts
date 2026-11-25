import { sql } from "drizzle-orm";

import {
  ADMIN,
  addPersonService,
  createPersonAtGoogle,
  postFakeControl,
  storedAppAccounts,
  storedAppConnections,
  SYSTEM,
  NEW_PERSON,
  provisioning,
  employeeServices,
  expect,
  googleScanSetup,
  storedEmployeeTemplates,
  storedEmployees,
  test,
} from "#test/support";

test("a missing template leaves neither the new person nor a partial assignment", async ({
  orm,
  seed,
  fakeGoogle,
}) => {
  const { owner } = await googleScanSetup(orm, fakeGoogle.url);
  const template = await seed.template();

  await expect(
    addPersonService(orm).addPerson(owner, {
      ...NEW_PERSON,
      templateIds: [template.id, UNKNOWN_ID],
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });

  expect((await storedEmployees(orm)).filter(({ email }) => email === NEW_PERSON.email)).toEqual(
    [],
  );
  expect(await storedEmployeeTemplates(orm)).toEqual([]);
});

test("two spellings of one template ID record one assignment in employee History", async ({
  orm,
  fakeGoogle,
}) => {
  const { owner } = await googleScanSetup(orm, fakeGoogle.url);
  const templateId = "abcdefab-1234-4345-89ab-000000000001";
  await orm.execute(sql`insert into templates (id, name) values (${templateId}, 'Engineering')`);

  const person = await addPersonService(orm).addPerson(owner, {
    ...NEW_PERSON,
    templateIds: [templateId, templateId.toUpperCase()],
  });

  expect(await storedEmployeeTemplates(orm)).toMatchObject([{ employeeId: person.id, templateId }]);
  const history = await employeeServices(orm).readEmployeeHistory(owner, person.id, {});
  const assignments = history.edges.flatMap(({ node }) =>
    node.changes.filter(({ field }) => field === "template"),
  );
  expect(assignments).toMatchObject([{ oldValue: null, newValue: templateId }]);
});

test("only the owner can add or delete a pending person", async ({ orm, fakeGoogle }) => {
  const { owner } = await googleScanSetup(orm, fakeGoogle.url);
  const people = addPersonService(orm);
  const input = { ...NEW_PERSON, templateIds: [] };

  await expect(people.addPerson(ADMIN, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  const person = await people.addPerson(owner, input);
  await expect(people.deletePerson(ADMIN, person.id)).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(await employeeServices(orm).readEmployee(owner, person.id)).toMatchObject(NEW_PERSON);
});

test("deleting a pending person removes their assignments and a second delete reports not found", async ({
  orm,
  seed,
  fakeGoogle,
}) => {
  const { owner } = await googleScanSetup(orm, fakeGoogle.url);
  const template = await seed.template();
  const people = addPersonService(orm);
  const person = await people.addPerson(owner, { ...NEW_PERSON, templateIds: [template.id] });
  expect(await storedEmployeeTemplates(orm)).toMatchObject([
    { employeeId: person.id, templateId: template.id },
  ]);

  await people.deletePerson(owner, person.id);

  expect(await employeeServices(orm).readEmployee(owner, person.id)).toBeNull();
  expect(await storedEmployeeTemplates(orm)).toEqual([]);
  await expect(people.deletePerson(owner, person.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("an employee created through the original employee service cannot be deleted as a pending person", async ({
  orm,
  fakeGoogle,
}) => {
  const { owner } = await googleScanSetup(orm, fakeGoogle.url);
  const employees = employeeServices(orm);
  const person = await employees.createEmployee(owner, NEW_PERSON);

  await expect(addPersonService(orm).deletePerson(owner, person!.id)).rejects.toMatchObject({
    code: "CONFLICT",
  });
  expect(await employees.readEmployee(owner, person!.id)).toMatchObject(NEW_PERSON);
});

test("Provision leaves an employee created through the original employee service without a new Google invite", async ({
  orm,
  fakeGoogle,
}) => {
  const { owner } = await googleScanSetup(orm, fakeGoogle.url);
  const person = await employeeServices(orm).createEmployee(owner, NEW_PERSON);

  const changes = await provisioning(orm).provisionEmployee(owner, {
    employeeId: person!.id,
    appIds: [],
  });

  expect(changes).toEqual([]);
});

test.for(["legacy", "added"] as const)(
  "a linked directory account protects a %s employee even without scan History",
  async (source, { orm, seed, fakeGoogle }) => {
    const { owner, connectionId } = await googleScanSetup(orm, fakeGoogle.url);
    const people = addPersonService(orm);
    const person =
      source === "legacy"
        ? (await employeeServices(orm).createEmployee(owner, NEW_PERSON))!
        : await people.addPerson(owner, { ...NEW_PERSON, templateIds: [] });
    const connection = (await storedAppConnections(orm)).find(({ id }) => id === connectionId)!;
    await seed.appAccount({
      appId: connection.appId,
      employeeId: person.id,
      email: NEW_PERSON.email,
      foundVia: ["google_directory"],
      status: "suspended",
    });

    await expect(people.deletePerson(owner, person.id)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      await provisioning(orm).provisionEmployee(owner, { employeeId: person.id, appIds: [] }),
    ).toEqual([]);
  },
);

test("an unchanged scan matches an externally created directory account and keeps the added person protected", async ({
  orm,
  fakeGoogle,
}) => {
  const { owner, connectionId, sourceId, scans } = await googleScanSetup(orm, fakeGoogle.url);
  const people = addPersonService(orm);
  const { id } = await people.addPerson(owner, { ...NEW_PERSON, templateIds: [] });
  await createPersonAtGoogle(orm, fakeGoogle.url, owner, NEW_PERSON);

  await scans.runScan(SYSTEM, sourceId);
  expect(
    (await storedAppAccounts(orm)).filter(({ email }) => email === NEW_PERSON.email),
  ).toMatchObject([{ employeeId: id, foundVia: ["google_directory"] }]);
  await expect(people.deletePerson(owner, id)).rejects.toMatchObject({ code: "CONFLICT" });

  await postFakeControl(fakeGoogle.url, `users/${NEW_PERSON.email}/delete`);
  await scans.scanNow(owner, connectionId);
  await scans.runScan(SYSTEM, sourceId);
  expect((await storedAppAccounts(orm)).filter(({ email }) => email === NEW_PERSON.email)).toEqual(
    [],
  );
  await expect(people.deletePerson(owner, id)).rejects.toMatchObject({ code: "CONFLICT" });
});

test("the owner cannot change the work email of a person awaiting their first directory scan", async ({
  orm,
  fakeGoogle,
}) => {
  const { owner } = await googleScanSetup(orm, fakeGoogle.url);
  const { id } = await addPersonService(orm).addPerson(owner, { ...NEW_PERSON, templateIds: [] });
  const employees = employeeServices(orm);

  await expect(
    employees.updateEmployee(owner, { id, email: "other@acme.example" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await employees.readEmployee(owner, id)).toMatchObject({ email: NEW_PERSON.email });
});

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000001";
