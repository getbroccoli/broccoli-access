import { containerConnectors, expect, inviteTest as test, provisioning } from "#test/support";
import { accountChanges } from "../db";

test("provisions one app once per selected person and continues past a refused employee", async ({
  workspace: {
    assignLinearRole,
    assignAppWithoutConnection,
    provision,
    owner,
    ivan,
    employee,
    linear,
    sent,
  },
  seed,
}) => {
  const template = await assignLinearRole(null);
  await assignAppWithoutConnection();
  const elif = employee("elif@acme.example");
  const suspended = employee("ben@acme.example");
  const alreadyActive = employee("chloe@acme.example");
  for (const { id } of [elif, suspended, alreadyActive]) {
    await seed.employeeTemplate({
      employeeId: id,
      templateId: template.id,
      assignedBy: owner.user!.userId,
    });
  }
  const unknown = "00000000-0000-4000-8000-000000000001";

  const { changes, refusedEmployeeIds } = await provision.provisionApp(owner, {
    appId: linear.appId,
    employeeIds: [ivan.id, suspended.id, unknown, alreadyActive.id, elif.id, ivan.id, unknown],
  });

  expect(refusedEmployeeIds.toSorted()).toEqual([suspended.id, unknown].sort());
  expect(changes).toHaveLength(2);
  for (const employeeId of [ivan.id, elif.id]) {
    expect(changes).toContainEqual(
      expect.objectContaining({
        appId: linear.appId,
        employeeId,
        action: "invite",
        startedFrom: "provision",
        status: "running",
      }),
    );
  }
  expect(sent).toHaveLength(2);
  for (const { id } of changes) {
    expect(sent).toContainEqual(expect.objectContaining({ payload: { changeId: id } }));
  }
});

test("a failed enqueue rolls back just that person and returns the other committed invites", async ({
  workspace: { owner, ivan, employee, linear, assignLinearRole },
  seed,
  orm,
  fakeConnectors,
}) => {
  const template = await assignLinearRole(null);
  const elif = employee("elif@acme.example");
  const farah = employee("farah@acme.example");
  for (const { id } of [elif, farah]) {
    await seed.employeeTemplate({
      templateId: template.id,
      employeeId: id,
      assignedBy: owner.user!.userId,
    });
  }
  let enqueues = 0;
  const provision = provisioning(orm, {
    connectors: containerConnectors(fakeConnectors.url),
    jobs: {
      send: () =>
        ++enqueues === 2 ? Promise.reject(new Error("Queue unavailable")) : Promise.resolve(),
    },
  });

  const result = await provision.provisionApp(owner, {
    appId: linear.appId,
    employeeIds: [ivan.id, elif.id, farah.id],
  });

  expect(result.refusedEmployeeIds).toEqual([elif.id]);
  expect(result.changes.map(({ employeeId }) => employeeId).sort()).toEqual(
    [ivan.id, farah.id].sort(),
  );
  const stored = await orm.select({ id: accountChanges.id }).from(accountChanges);
  expect(stored.map(({ id }) => id).sort()).toEqual(result.changes.map(({ id }) => id).sort());
});
