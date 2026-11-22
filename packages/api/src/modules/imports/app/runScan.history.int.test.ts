import { expect, test, SYSTEM, googleScanSetup, recordHistory } from "#test/support";

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
    changes: [
      {
        field: "manager",
        oldValue: olive.id,
        oldLabel: "Olive Stone",
        newLabel: "David Okafor",
      },
    ],
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
    changes: [
      {
        field: "manager",
        oldValue: null,
        newValue: david.id,
        oldLabel: null,
        newLabel: "David Okafor",
      },
    ],
  });
});
