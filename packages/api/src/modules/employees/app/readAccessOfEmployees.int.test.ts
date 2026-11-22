import {
  approvedGoogleSetup,
  employeeServices,
  EMPLOYEE,
  expect,
  OWNER,
  test,
} from "#test/support";

test("reads directory status and approved app names in the requested employee order", async ({
  orm,
  fakeGoogle,
}) => {
  await approvedGoogleSetup(orm, fakeGoogle.url);
  const service = employeeServices(orm);
  const { edges } = await service.listEmployees(OWNER, { first: 100 });
  const ana = edges.find(({ node }) => node.email === "ana@acme.example")!.node;
  const mia = edges.find(({ node }) => node.email === "admin@acme.example")!.node;

  const access = await service.readAccessOfEmployees(OWNER, [mia.id, ana.id]);

  expect(access).toEqual([
    { status: "active", approvedAppNames: ["Slack"], suspendedWithAccess: false },
    {
      status: "suspended",
      approvedAppNames: ["Figma", "Notion", "Slack"],
      suspendedWithAccess: true,
    },
  ]);
});

test("reads no status or apps for an employee without accounts", async ({ orm, seed }) => {
  const employee = await seed.employee();

  const access = await employeeServices(orm).readAccessOfEmployees(OWNER, [employee.id]);

  expect(access).toEqual([{ status: null, approvedAppNames: [], suspendedWithAccess: false }]);
});

test("refuses to read employee access without MANAGE_WORKSPACE", async ({ orm, seed }) => {
  const employee = await seed.employee();

  await expect(
    employeeServices(orm).readAccessOfEmployees(EMPLOYEE, [employee.id]),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
