import {
  apps,
  approvedGoogleSetup,
  employeeServices,
  googleScanWithLinearGrant,
  scannedLinear,
  EMPLOYEE,
  expect,
  OWNER,
  test,
} from "#test/support";

test("counts all employees and those suspended with approved access", async ({
  orm,
  fakeGoogle,
}) => {
  await approvedGoogleSetup(orm, fakeGoogle.url);

  const counts = await employeeServices(orm).countEmployees(OWNER);

  expect(counts).toEqual({ all: 42, suspendedWithAccess: 2 });
});

test("excludes a suspended employee whose only other accounts are in ignored apps", async ({
  orm,
  fakeGoogle,
}) => {
  await approvedGoogleSetup(orm, fakeGoogle.url);
  const service = apps(orm);
  const { edges } = await service.listApps(OWNER, { status: "approved" });
  const slack = edges.find(({ node }) => node.name === "Slack")!.node;
  await service.ignoreApp(OWNER, slack.id);

  const counts = await employeeServices(orm).countEmployees(OWNER);

  expect(counts).toEqual({ all: 42, suspendedWithAccess: 1 });
});

test("excludes a suspended employee whose only approved access is a Google-only Linear account", async ({
  orm,
  fakeGoogle,
  fakeConnectors,
}) => {
  await googleScanWithLinearGrant(orm, fakeGoogle.url, "ben@acme.example");
  await scannedLinear(orm, fakeConnectors.url);

  const counts = await employeeServices(orm).countEmployees(OWNER);

  expect(counts.suspendedWithAccess).toBe(1);
});

test("refuses to count employees without MANAGE_WORKSPACE", async ({ orm }) => {
  await expect(employeeServices(orm).countEmployees(EMPLOYEE)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
