import { employeeServices, expect, OWNER, test } from "#test/support";
import { ApplicationError } from "../applicationError";
import type { PageArgs } from "./index";

// Each family uses its own valid envelope, so an unrelated order cannot mask value validation.
test.for([
  {
    field: "Query.employees",
    values: ["NAME", "ASC", "\0", "", "00000000-0000-4000-8000-000000000001"],
  },
  { field: "Employee.history", values: ["NEWEST", "DESC", "\0"] },
] as const)(
  "%j accepts or refuses decoded cursor values without a raw error",
  async ({ field, values }, { orm, seed }) => {
    // Arrange: non-empty lists and real history, so the cursor reaches the use case.
    const employees = employeeServices(orm);
    const person = await seed.employee();
    await employees.updateEmployee(OWNER, { id: person.id, firstName: "Avery" });
    await employees.updateEmployee(OWNER, { id: person.id, firstName: "Robin" });
    const connections = {
      "Query.employees": (args: PageArgs) => employees.listEmployees(OWNER, args),
      "Employee.history": (args: PageArgs) => employees.readEmployeeHistory(OWNER, person.id, args),
    };
    const after = Buffer.from(JSON.stringify(values)).toString("base64url");

    // Act
    const [result] = await Promise.allSettled([
      Promise.resolve().then<unknown>(() => connections[field]({ first: 1, after })),
    ]);

    // Assert: database-bound keys must refuse NUL.
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toBeInstanceOf(ApplicationError);
    expect(result.reason).toMatchObject({ code: "INVALID_INPUT" });
  },
);
