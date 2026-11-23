import {
  appUsers,
  approvedGoogleSetup,
  connectLinear,
  EMPLOYEE,
  expect,
  OWNER,
  storedApps,
  test,
} from "#test/support";

test("lists active approved accounts and suspended connected accounts by app name, excluding the directory", async ({
  orm,
  seed,
  fakeGoogle,
  fakeConnectors,
}) => {
  await approvedGoogleSetup(orm, fakeGoogle.url);
  const linear = await connectLinear(orm, fakeConnectors.url);
  const apps = await storedApps(orm);
  const appId = (name: string) => apps.find((app) => app.name === name)!.id;
  const employee = await seed.employee();
  const account = { employeeId: employee.id, email: employee.email };
  const slack = await seed.appAccount({ ...account, appId: appId("Slack") });
  const disabled = await seed.appAccount({ ...account, appId: linear.appId, status: "suspended" });
  const figma = await seed.appAccount({ ...account, appId: appId("Figma") });
  await seed.appAccount({ ...account, appId: appId("Google Workspace") });
  await seed.appAccount({ ...account, appId: appId("Asana") });
  await seed.appAccount({ ...account, appId: appId("Notion"), status: "suspended" });

  const users = await appUsers(orm).readUsersOfEmployees(OWNER, [employee.id]);

  expect(users.map((user) => user.id)).toEqual([figma.id, disabled.id, slack.id]);
});

test("refuses to list an employee's accounts without MANAGE_WORKSPACE", async ({ orm, seed }) => {
  const employee = await seed.employee();

  await expect(appUsers(orm).readUsersOfEmployees(EMPLOYEE, [employee.id])).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
