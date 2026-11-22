import { employeeServices, expect, OWNER, test } from "#test/support";

test("returns the employee with the requested id", async ({ orm, seed }) => {
  const employee = await seed.employee();

  expect(await employeeServices(orm).readEmployee(OWNER, employee.id)).toEqual(employee);
});

test("returns null for an unknown employee", async ({ orm }) => {
  expect(
    await employeeServices(orm).readEmployee(OWNER, "00000000-0000-4000-8000-000000000001"),
  ).toBeNull();
});

test("returns null for a malformed id", async ({ orm }) => {
  expect(await employeeServices(orm).readEmployee(OWNER, "not-an-id")).toBeNull();
});

test("returns history for an employee id written in uppercase", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const employees = employeeServices(orm);
  await employees.updateEmployee(OWNER, { id: employee.id, firstName: "Lead" });
  const history = await employees.readEmployeeHistory(OWNER, employee.id, {});

  const page = await employees.readEmployeeHistory(OWNER, employee.id.toUpperCase(), {});

  expect(history.edges).toHaveLength(1);
  expect(page).toEqual(history);
});
