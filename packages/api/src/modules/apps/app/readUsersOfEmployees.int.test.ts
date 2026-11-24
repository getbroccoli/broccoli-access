import {
  accountLinks,
  appUsers,
  approvedGoogleSetup,
  connectLinear,
  googleScanWithLinearGrant,
  listedLinearChloe,
  scannedLinear,
  EMPLOYEE,
  expect,
  OWNER,
  serveAccountList,
  storedAppAccounts,
  storedApps,
  SYSTEM,
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

test("omits a person's Google-only Linear account after Linear's first scan", async ({
  orm,
  fakeGoogle,
  fakeConnectors,
}) => {
  await googleScanWithLinearGrant(orm, fakeGoogle.url, "ben@acme.example");
  const linear = await scannedLinear(orm, fakeConnectors.url);
  const ben = linear.account("ben@acme.example");
  const ana = linear.account("ana@acme.example");

  const users = await appUsers(orm).readUsersOfEmployees(OWNER, [ben.employeeId!, ana.employeeId!]);

  expect(users.map(({ id }) => id)).toEqual([ana.id]);
});

test("restores the same owner-linked account to the person page when Linear finds it again", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const owner = await seed.owner();
  const person = await seed.employee();
  const member = listedLinearChloe("active");
  let members = [member];
  const server = await serveAccountList(fakeConnectors.url, (_request, response) => {
    response.json({ accounts: members, nextCursor: null });
  });
  const linear = await connectLinear(orm, server.url);
  const account = await seed.appAccount({
    appId: linear.appId,
    email: member.values.email,
    foundVia: ["google_sign_in"],
  });
  await linear.scans.runScan(SYSTEM, linear.sourceId);
  await accountLinks(orm).linkAccount(owner, { appAccountId: account.id, employeeId: person.id });
  const personAccounts = () => appUsers(orm).readUsersOfEmployees(owner, [person.id]);
  expect(await personAccounts()).toMatchObject([{ id: account.id, inApp: true }]);

  members = [];
  await linear.scans.scanNow(owner, linear.connectionId);
  await linear.scans.runScan(SYSTEM, linear.sourceId);
  expect(await personAccounts()).toEqual([]);
  expect(await storedAppAccounts(orm)).toMatchObject([
    {
      id: account.id,
      employeeId: person.id,
      employeeLinkedBy: "owner",
      foundVia: ["google_sign_in"],
    },
  ]);

  members = [member];
  await linear.scans.scanNow(owner, linear.connectionId);
  await linear.scans.runScan(SYSTEM, linear.sourceId);
  expect(await personAccounts()).toMatchObject([
    { id: account.id, employeeId: person.id, inApp: true },
  ]);
});

test("refuses to list an employee's accounts without MANAGE_WORKSPACE", async ({ orm, seed }) => {
  const employee = await seed.employee();

  await expect(appUsers(orm).readUsersOfEmployees(EMPLOYEE, [employee.id])).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
