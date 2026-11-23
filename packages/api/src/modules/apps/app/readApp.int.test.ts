import {
  expect,
  test,
  OWNER,
  EMPLOYEE,
  SYSTEM,
  apps,
  appUsers,
  connectLinear,
  googleScanSetup,
  googleScanWithLinearGrant,
  scannedLinear,
  storedAppAccounts,
} from "#test/support";

import type { Orm } from "../../../core/db";

test("reads Figma with sixteen people and one suspended person who still has access", async ({
  orm,
  fakeGoogle,
}) => {
  const { service, figma } = await scannedFigma(orm, fakeGoogle.url);

  const app = await service.readApp(OWNER, figma.id);

  expect(app).toEqual(figma);
  expect(app).toMatchObject({ name: "Figma", peopleCount: 16, suspendedWithAccessCount: 1 });
});

test("counts only the people Linear lists after its first scan", async ({
  orm,
  fakeGoogle,
  fakeConnectors,
}) => {
  await googleScanWithLinearGrant(orm, fakeGoogle.url, "ben@acme.example");
  const linear = await scannedLinear(orm, fakeConnectors.url);

  const app = await apps(orm, { connectorsUrl: fakeConnectors.url }).readApp(OWNER, linear.appId);

  expect(app).toMatchObject({
    peopleCount: 7,
    suspendedWithAccessCount: 1,
    foundVia: ["linear_members"],
    since: { at: linear.account("ana@acme.example").firstSeenAt, before: false },
  });
});

test("lists Linear members first and the suspended person found only by Google last", async ({
  orm,
  fakeGoogle,
  fakeConnectors,
}) => {
  await googleScanWithLinearGrant(orm, fakeGoogle.url, "ben@acme.example");
  const linear = await scannedLinear(orm, fakeConnectors.url);

  const users = await appUsers(orm, { connectorsUrl: fakeConnectors.url }).readUsersOfApps(OWNER, [
    linear.appId,
  ]);

  expect(users).toMatchObject([
    ...["ana", "chloe", "david", "gabriel", "hannah", "jun", "admin"].map((name) => ({
      email: `${name}@acme.example`,
      inApp: true,
    })),
    { email: "ben@acme.example", inApp: false },
  ]);
});

test("counts a Google sign-in while Linear's first scan is pending", async ({
  orm,
  fakeGoogle,
  fakeConnectors,
}) => {
  await googleScanWithLinearGrant(orm, fakeGoogle.url, "ben@acme.example");
  const linear = await connectLinear(orm, fakeConnectors.url);
  const options = { connectorsUrl: fakeConnectors.url };

  const app = await apps(orm, options).readApp(OWNER, linear.appId);
  const users = await appUsers(orm, options).readUsersOfApps(OWNER, [linear.appId]);

  expect(app).toMatchObject({ peopleCount: 1, suspendedWithAccessCount: 1 });
  expect(users).toMatchObject([{ email: "ben@acme.example", inApp: null }]);
});

test("shows Ana's suspended directory status and access from before the sign-in log", async ({
  orm,
  fakeGoogle,
}) => {
  const { figma, scanStartedAt, scanFinishedAt } = await scannedFigma(orm, fakeGoogle.url);
  const accounts = await storedAppAccounts(orm);
  const ana = accounts.find(
    ({ appId, email }) => appId === figma.id && email === "ana@acme.example",
  )!;

  const users = await appUsers(orm).readUsersOfApps(OWNER, [figma.id]);

  expect(users).toHaveLength(16);
  expect(users[0]).toMatchObject({
    id: ana.id,
    appId: figma.id,
    employeeId: ana.employeeId,
    email: "ana@acme.example",
    suspendedInDirectory: true,
    foundVia: ["google_sign_in"],
    since: { before: true },
  });
  const since = users[0]!.since.at.getTime();
  expect(since).toBeGreaterThanOrEqual(scanStartedAt - 180 * 86_400_000);
  expect(since).toBeLessThanOrEqual(scanFinishedAt - 180 * 86_400_000);
  expect(since).not.toBe(ana.firstSeenAt.getTime());
});

test("orders users by directory suspension, then first and last name ignoring case", async ({
  orm,
  seed,
  fakeGoogle,
}) => {
  await googleScanSetup(orm, fakeGoogle.url);
  const directoryAppId = (await apps(orm).directoryAppId(orm))!;
  const app = await seed.app();
  const people = [
    { firstName: "zoe", lastName: "Zebra", suspended: true },
    { firstName: "zoe", lastName: "alpha", suspended: true },
    { firstName: "Wren", lastName: "Finch", suspended: true },
    { firstName: "wren", lastName: "Alder", suspended: true },
    { firstName: "amy", lastName: "Zebra", suspended: false },
    { firstName: "amy", lastName: "alpha", suspended: false },
    { firstName: "Ben", lastName: "Finch", suspended: false },
    { firstName: "ben", lastName: "Alder", suspended: false },
  ];
  const accountIds: string[] = [];
  for (const [index, { firstName, lastName, suspended }] of people.entries()) {
    const employee = await seed.employee({ firstName, lastName });
    await seed.appAccount({
      appId: directoryAppId,
      employeeId: employee.id,
      status: suspended ? "suspended" : "active",
      foundVia: ["google_directory"],
    });
    const account = await seed.appAccount({
      appId: app.id,
      employeeId: employee.id,
      email: `person${index}@example.com`,
      status: suspended ? "active" : "suspended",
    });
    accountIds.push(account.id);
  }

  const users = await appUsers(orm).readUsersOfApps(OWNER, [app.id]);

  expect(users.map(({ id }) => id)).toEqual([3, 2, 1, 0, 5, 4, 7, 6].map((i) => accountIds[i]));
  expect(users.map(({ suspendedInDirectory }) => suspendedInDirectory)).toEqual([
    true,
    true,
    true,
    true,
    false,
    false,
    false,
    false,
  ]);
});

test("excludes accounts without an employee from an app's users", async ({ orm, seed }) => {
  const app = await seed.app();
  const employee = await seed.employee();
  const account = await seed.appAccount({ appId: app.id, employeeId: employee.id });
  await seed.appAccount({ appId: app.id, employeeId: null });

  const users = await appUsers(orm).readUsersOfApps(OWNER, [app.id]);

  expect(users.map(({ id, employeeId }) => ({ id, employeeId }))).toEqual([
    { id: account.id, employeeId: employee.id },
  ]);
});

test.for([
  ["an unknown", "00000000-0000-4000-8000-000000000001"],
  ["a malformed", "not-a-uuid"],
] as const)("returns null for %s app id", async ([, id], { orm }) => {
  expect(await apps(orm).readApp(OWNER, id)).toBeNull();
});

test("refuses to read an app without MANAGE_WORKSPACE", async ({ orm, seed }) => {
  const app = await seed.app();

  await expect(apps(orm).readApp(EMPLOYEE, app.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("refuses to read app users without MANAGE_WORKSPACE", async ({ orm, seed }) => {
  const app = await seed.app();

  await expect(appUsers(orm).readUsersOfApps(EMPLOYEE, [app.id])).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

async function scannedFigma(orm: Orm, googleUrl: string) {
  const { scans, sourceId } = await googleScanSetup(orm, googleUrl);
  const scanStartedAt = Date.now();
  await scans.runScan(SYSTEM, sourceId);
  const scanFinishedAt = Date.now();
  const service = apps(orm);
  const discovered = await service.listApps(OWNER, { status: "discovered" });
  const approvedAppIds = discovered.edges
    .filter(({ node }) => node.preselected)
    .map(({ node }) => node.id);
  await service.finishSetup(OWNER, { approvedAppIds });
  const approved = await service.listApps(OWNER, { status: "approved" });
  const figma = approved.edges.find(({ node }) => node.name === "Figma")!.node;
  return { service, figma, scanStartedAt, scanFinishedAt };
}
