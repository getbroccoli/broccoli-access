import { employeeServices, expect, OWNER, test } from "#test/support";

test("reads the employees with the requested emails, leaving out an email nobody has", async ({
  orm,
  seed,
}) => {
  const ana = await seed.employee({ email: "ana@example.com" });
  const mia = await seed.employee({ email: "mia@example.com" });
  await seed.employee({ email: "chloe@example.com" });

  const employees = await employeeServices(orm).readEmployeesByEmails(OWNER, [
    mia.email,
    "unknown@example.com",
    ana.email,
  ]);

  expect(new Set(employees)).toEqual(new Set([ana, mia]));
});
