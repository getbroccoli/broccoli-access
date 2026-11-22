import {
  expect,
  test,
  OWNER,
  SYSTEM,
  googleScanSetup,
  recordHistory,
  employeeServices,
  storedEmployees,
  storedImportSources,
} from "#test/support";

test("labels the previous manager by name even when the directory no longer lists them", async ({
  orm,
  seed,
  fakeGoogle,
}) => {
  const olive = await seed.employee({
    email: "olive@example.com",
    firstName: "Olive",
    lastName: "Stone",
  });
  const ana = await seed.employee({
    email: "ana@acme.example",
    firstName: "Ana",
    lastName: "Ruiz",
    managerId: olive.id,
  });
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);

  await scans.runScan(SYSTEM, sourceId);

  const { edges } = await recordHistory.read(orm, "employee", ana.id, {});
  expect(edges).toHaveLength(1);
  expect(edges[0]!.node).toMatchObject({
    operation: "UPDATED",
    cause: { kind: "FOUND_BY_SCAN", ref: sourceId },
  });
  expect(edges[0]!.node.changes.find(({ field }) => field === "manager")).toMatchObject({
    oldValue: olive.id,
    oldLabel: "Olive Stone",
    newLabel: "David Okafor",
  });
});

test("labels a manager renamed by the same scan with their new name", async ({
  orm,
  seed,
  fakeGoogle,
}) => {
  const david = await seed.employee({
    email: "david@acme.example",
    firstName: "Dave",
    lastName: "Okafor",
  });
  const ana = await seed.employee({
    email: "ana@acme.example",
    firstName: "Ana",
    lastName: "Ruiz",
    managerId: null,
  });
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);

  await scans.runScan(SYSTEM, sourceId);

  const { edges } = await recordHistory.read(orm, "employee", ana.id, {});
  expect(edges).toHaveLength(1);
  expect(edges[0]!.node).toMatchObject({
    operation: "UPDATED",
    cause: { kind: "FOUND_BY_SCAN", ref: sourceId },
  });
  expect(edges[0]!.node.changes.find(({ field }) => field === "manager")).toMatchObject({
    oldValue: null,
    newValue: david.id,
    oldLabel: null,
    newLabel: "David Okafor",
  });
});

test("a rescan after the owner's employee changed email keeps the owner linked to that employee and still finishes", async ({
  orm,
  fakeGoogle,
  transact,
}) => {
  const { scans, sourceId, connectionId, ownerUserId } = await googleScanSetup(orm, fakeGoogle.url);
  await scans.runScan(SYSTEM, sourceId);
  const mia = (await storedEmployees(orm)).find(({ email }) => email === "admin@acme.example")!;
  expect(mia.userId).toBe(ownerUserId);
  await employeeServices(orm).updateEmployee(OWNER, { id: mia.id, email: "mia@example.com" });
  await transact((tx) =>
    scans.scanConnection(OWNER, tx, { connectionId, sourceName: "acme.example" }),
  );

  await scans.runScan(SYSTEM, sourceId);

  expect(await storedImportSources(orm)).toMatchObject([
    { id: sourceId, status: "scanned", failure: null },
  ]);
  const people = await storedEmployees(orm);
  expect(people.find(({ email }) => email === "mia@example.com")).toMatchObject({
    id: mia.id,
    userId: ownerUserId,
  });
  const newAdmin = people.find(({ email }) => email === "admin@acme.example");
  expect(newAdmin).toMatchObject({ userId: null });
  expect(newAdmin!.id).not.toBe(mia.id);
});
