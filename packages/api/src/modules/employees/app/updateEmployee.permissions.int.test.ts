import { ADMIN, employeeServices, expect, OWNER, signedIn, test } from "#test/support";

test("allows an employee to change their own first name", async ({ orm, seed }) => {
  const anna = await seed.employee({ firstName: "Anna" });
  const ctx = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: anna.id });
  const employees = employeeServices(orm);

  await employees.updateEmployee(ctx, {
    id: anna.id,
    firstName: "Anne",
    changeReason: "Preferred name",
  });

  expect(await employees.readEmployee(OWNER, anna.id)).toMatchObject({ firstName: "Anne" });
});

test("refuses an employee changing their own email without saving their name", async ({
  orm,
  seed,
}) => {
  const anna = await seed.employee({ firstName: "Anna" });
  const ctx = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: anna.id });
  const employees = employeeServices(orm);

  await expect(
    employees.updateEmployee(ctx, { id: anna.id, firstName: "Anne", email: "anne@example.com" }),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "You cannot change some of these fields.",
    fieldErrors: [{ field: "email", code: "not_allowed" }],
  });

  expect(await employees.readEmployee(OWNER, anna.id)).toEqual(anna);
  expect((await employees.readEmployeeHistory(OWNER, anna.id, {})).edges).toEqual([]);
});

test("refuses an employee changing a coworker", async ({ orm, seed }) => {
  const anna = await seed.employee({ firstName: "Anna" });
  const coworker = await seed.employee();
  const ctx = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: anna.id });
  const employees = employeeServices(orm);

  await expect(
    employees.updateEmployee(ctx, { id: coworker.id, firstName: "Lead" }),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "You are not allowed to do this.",
  });

  expect(await employees.readEmployee(OWNER, coworker.id)).toEqual(coworker);
});

test("allows an admin without an employee to change every employee update field", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const employees = employeeServices(orm);
  const changes = { firstName: "Anna", lastName: "Reed", email: "anna@example.com" };

  await employees.updateEmployee(ADMIN, { id: employee.id, ...changes });

  expect(await employees.readEmployee(OWNER, employee.id)).toMatchObject(changes);
});
