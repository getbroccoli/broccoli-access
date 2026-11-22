import { eq } from "drizzle-orm";
import { assert } from "vitest";

import {
  ADMIN,
  signedIn,
  recordChangedEvents,
  employeeServices,
  expect,
  expectHistoryReplaysTo,
  OWNER,
  PNG,
  storedFileIds,
  test,
} from "#test/support";

import { user } from "../../../core/auth";

test("deletes the employee and avatar while keeping a history of their removed values", async ({
  orm,
  seed,
}) => {
  const avatarFileId = await seed.file({ content: PNG, mimeType: "image/png" });
  const employee = await seed.employee({
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
    avatarFileId,
  });
  const employees = employeeServices(orm);
  const { transact: transactWithEvents, events } = recordChangedEvents(orm);

  const deleted = await employeeServices(orm, {
    transact: transactWithEvents,
  }).deleteEmployee(OWNER, { id: employee.id, changeReason: "  Left  " });

  expect(deleted).toEqual({ deletedEmployeeId: employee.id });
  expect(await employees.readEmployee(OWNER, employee.id)).toBeNull();
  expect(await storedFileIds(orm)).toEqual([]);
  const { edges } = await employees.readEmployeeHistory(OWNER, employee.id, {});
  expect(edges).toHaveLength(1);
  expect(edges[0]!.node).toMatchObject({
    recordType: "employee",
    recordId: employee.id,
    operation: "DELETED",
    author: { kind: "SIGNED_IN_USER", id: OWNER.user!.userId },
    cause: { kind: "EDITED_DIRECTLY", ref: null },
    reason: "Left",
    changes: [
      { field: "firstName", oldValue: "Avery", newValue: null },
      { field: "lastName", oldValue: "Stone", newValue: null },
      { field: "email", oldValue: "avery@example.com", newValue: null },
    ],
  });
  expect(events).toEqual([
    {
      historyId: edges[0]!.node.id,
      recordType: "employee",
      recordId: employee.id,
      operation: "DELETED",
      fields: ["firstName", "lastName", "email"],
      causeKind: "EDITED_DIRECTLY",
      causeRef: null,
    },
  ]);
});

test.for(["00000000-0000-4000-8000-000000000001", "not-a-uuid"])(
  "refuses deletion of unknown id %s",
  async (id, { orm }) => {
    await expect(employeeServices(orm).deleteEmployee(OWNER, { id })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "No employee has this id.",
    });
  },
);

test("a deletion addressed by uppercase id keeps its history under the canonical id", async ({
  orm,
}) => {
  const employees = employeeServices(orm);
  const employee = await employees.createEmployee(OWNER, {
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
  });
  assert(employee);

  const deleted = await employees.deleteEmployee(OWNER, { id: employee.id.toUpperCase() });

  expect(deleted).toEqual({ deletedEmployeeId: employee.id });
  expect(await employees.readEmployee(OWNER, employee.id)).toBeNull();
  const { edges } = await employees.readEmployeeHistory(OWNER, employee.id, {});
  expect(edges.map(({ node }) => ({ recordId: node.recordId, operation: node.operation }))).toEqual(
    [
      { recordId: employee.id, operation: "DELETED" },
      { recordId: employee.id, operation: "CREATED" },
    ],
  );
  await expectHistoryReplaysTo(orm, employee.id);
});

test("refuses an admin deleting the employee linked to the owner", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const employee = await seed.employee({ userId: owner.user!.userId });
  const employees = employeeServices(orm);
  const admin = signedIn(orm, { profiles: ["EMPLOYEE", "ADMIN"], employeeId: null });

  await expect(employees.deleteEmployee(admin, { id: employee.id })).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "The owner cannot be deleted.",
  });

  expect(await employees.readEmployee(OWNER, employee.id)).toEqual(employee);
  expect((await employees.readEmployeeHistory(OWNER, employee.id, {})).edges).toEqual([]);
});

test("allows an admin to delete another employee", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const employees = employeeServices(orm);

  await employees.deleteEmployee(ADMIN, { id: employee.id });

  expect(await employees.readEmployee(OWNER, employee.id)).toBeNull();
});

test("deleting a joined employee deletes their user and keeps the owner", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const joined = await seed.user({
    email: "joined@example.com",
  });
  const employee = await seed.employee({ userId: joined.id });

  await employeeServices(orm).deleteEmployee(owner, { id: employee.id });

  expect(await orm.select({ id: user.id }).from(user)).toEqual([{ id: owner.user!.userId }]);
  expect(await employeeServices(orm).readEmployee(owner, employee.id)).toBeNull();
});

test("rolls back the linked user deletion with the employee deletion", async ({
  orm,
  seed,
  transact,
}) => {
  const owner = await seed.owner();
  const joined = await seed.user({ email: "joined@example.com" });
  const employee = await seed.employee({ userId: joined.id });
  const employees = employeeServices(orm, {
    transact: (work) =>
      transact(async (tx) => {
        await work(tx);
        throw new Error("Transaction failed");
      }),
  });

  await expect(employees.deleteEmployee(owner, { id: employee.id })).rejects.toThrow(
    "Transaction failed",
  );

  expect(await employees.readEmployee(owner, employee.id)).toEqual(employee);
  expect(await orm.select({ id: user.id }).from(user).where(eq(user.id, joined.id))).toEqual([
    { id: joined.id },
  ]);
});
