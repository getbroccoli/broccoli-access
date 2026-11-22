import { assert } from "vitest";

import { employeeServices, expect, expectHistoryReplaysTo, OWNER, test } from "#test/support";

test("parallel first name edits keep their old and new values chained", async ({ orm }) => {
  const employees = employeeServices(orm);
  const employee = await employees.createEmployee(OWNER, {
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
  });
  assert(employee);

  await Promise.all([
    employees.updateEmployee(OWNER, { id: employee.id, firstName: "Lead" }),
    employees.updateEmployee(OWNER, { id: employee.id, firstName: "Principal" }),
  ]);

  const { edges } = await employees.readEmployeeHistory(OWNER, employee.id, {});
  const updates = edges
    .map(({ node }) => node)
    .filter((line) => line.operation === "UPDATED")
    .reverse();
  expect(updates).toHaveLength(2);
  expect(updates[0]!.changes).toEqual([
    { field: "firstName", oldValue: "Avery", newValue: expect.any(String) as unknown },
  ]);
  expect(updates[1]!.changes).toEqual([
    {
      field: "firstName",
      oldValue: updates[0]!.changes[0]!.newValue,
      newValue: expect.any(String) as unknown,
    },
  ]);
  expect(updates.map((line) => line.changes[0]!.newValue).sort()).toEqual(["Lead", "Principal"]);
  await expectHistoryReplaysTo(orm, employee.id);
});

test("an update addressed by uppercase id keeps its history under the canonical id", async ({
  orm,
}) => {
  const employees = employeeServices(orm);
  const employee = await employees.createEmployee(OWNER, {
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
  });
  assert(employee);

  const updated = await employees.updateEmployee(OWNER, {
    id: employee.id.toUpperCase(),
    firstName: "Lead",
  });

  expect(updated.employee?.id).toBe(employee.id);
  const { edges } = await employees.readEmployeeHistory(OWNER, employee.id, {});
  expect(edges.map(({ node }) => ({ recordId: node.recordId, operation: node.operation }))).toEqual(
    [
      { recordId: employee.id, operation: "UPDATED" },
      { recordId: employee.id, operation: "CREATED" },
    ],
  );
  await expectHistoryReplaysTo(orm, employee.id);
});
