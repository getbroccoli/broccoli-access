import { assert } from "vitest";

import {
  recordChangedEvents,
  employeeServices,
  expect,
  expectHistoryReplaysTo,
  OWNER,
  test,
} from "#test/support";

test("changes only sent fields and records their old and normalised new values", async ({
  orm,
}) => {
  const employees = employeeServices(orm);
  const employee = await employees.createEmployee(OWNER, {
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
  });
  assert(employee);

  const { transact, events } = recordChangedEvents(orm);

  const updated = await employeeServices(orm, {
    transact,
  }).updateEmployee(OWNER, {
    id: employee.id,
    firstName: "  Robin  ",
    email: "  ROBIN@EXAMPLE.COM  ",
    changeReason: "  Promoted  ",
  });

  expect(updated.employee).toEqual({
    ...employee,
    firstName: "Robin",
    email: "robin@example.com",
  });
  expect(await employees.readEmployee(OWNER, employee.id)).toEqual(updated.employee);
  const { edges } = await employees.readEmployeeHistory(OWNER, employee.id, {});
  expect(edges).toHaveLength(2);
  expect(edges[0]!.node).toMatchObject({
    recordType: "employee",
    recordId: employee.id,
    operation: "UPDATED",
    occurredAt: expect.any(Date) as unknown,
    author: { kind: "SIGNED_IN_USER", id: OWNER.user!.userId },
    cause: { kind: "EDITED_DIRECTLY", ref: null },
    reason: "Promoted",
    changes: [
      { field: "firstName", oldValue: "Avery", newValue: "Robin" },
      { field: "email", oldValue: "avery@example.com", newValue: "robin@example.com" },
    ],
  });
  expect(events).toEqual([
    {
      historyId: edges[0]!.node.id,
      recordType: "employee",
      recordId: employee.id,
      operation: "UPDATED",
      fields: ["firstName", "email"],
      causeKind: "EDITED_DIRECTLY",
      causeRef: null,
    },
  ]);
  await expectHistoryReplaysTo(orm, employee.id);
});

test("an update returns the history line it appended", async ({ orm, seed }) => {
  const employee = await seed.employee({ firstName: "Engineer" });
  const employees = employeeServices(orm);

  const { historyLine } = await employees.updateEmployee(OWNER, {
    id: employee.id,
    firstName: "Lead",
  });

  const { edges } = await employees.readEmployeeHistory(OWNER, employee.id, {});
  expect(edges).toHaveLength(1);
  expect(historyLine).toEqual(edges[0]!.node);
});

test("a save with unchanged values records no line and publishes nothing", async ({ orm }) => {
  const { transact, events } = recordChangedEvents(orm);
  const employee = await employeeServices(orm).createEmployee(OWNER, {
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
  });
  assert(employee);
  const employees = employeeServices(orm, { transact });
  const before = await employees.readEmployeeHistory(OWNER, employee.id, {});

  const updated = await employees.updateEmployee(OWNER, {
    id: employee.id,
    firstName: "  Avery  ",
    email: "AVERY@EXAMPLE.COM",
    changeReason: "No change",
  });

  expect(updated.employee).toEqual(employee);
  expect(updated.historyLine).toBeNull();
  expect(await employees.readEmployeeHistory(OWNER, employee.id, {})).toEqual(before);
  expect(events).toEqual([]);
});

test("refuses a taken email without changing the employee or history", async ({ orm, seed }) => {
  await seed.employee({ email: "taken@example.com" });
  const employees = employeeServices(orm);
  const employee = await employees.createEmployee(OWNER, {
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
  });
  assert(employee);
  const before = await employees.readEmployeeHistory(OWNER, employee.id, {});

  await expect(
    employees.updateEmployee(OWNER, {
      id: employee.id,
      email: "TAKEN@EXAMPLE.COM",
      firstName: "Lead",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "email", code: "taken" }],
  });

  expect(await employees.readEmployee(OWNER, employee.id)).toEqual(employee);
  expect(await employees.readEmployeeHistory(OWNER, employee.id, {})).toEqual(before);
});

test.for(["00000000-0000-4000-8000-000000000001", "not-a-uuid"])(
  "refuses an update to unknown id %s",
  async (id, { orm }) => {
    await expect(
      employeeServices(orm).updateEmployee(OWNER, { id, firstName: "Lead" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "No employee has this id.",
    });
  },
);

test("refuses a reason longer than 500 characters", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const employees = employeeServices(orm);

  await expect(
    employees.updateEmployee(OWNER, {
      id: employee.id,
      firstName: "Lead",
      changeReason: "x".repeat(501),
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "changeReason", code: "too_long" }],
  });

  expect(await employees.readEmployee(OWNER, employee.id)).toEqual(employee);
  expect((await employees.readEmployeeHistory(OWNER, employee.id, {})).edges).toEqual([]);
});

test.for(["firstName", "lastName", "email"] as const)(
  "refuses null for required field %s",
  async (field, { orm, seed }) => {
    const employee = await seed.employee();
    const employees = employeeServices(orm);

    await expect(
      employees.updateEmployee(OWNER, { id: employee.id, [field]: null }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field, code: "required" }],
    });

    expect(await employees.readEmployee(OWNER, employee.id)).toEqual(employee);
    expect((await employees.readEmployeeHistory(OWNER, employee.id, {})).edges).toEqual([]);
  },
);
