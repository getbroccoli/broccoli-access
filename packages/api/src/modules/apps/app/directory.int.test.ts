import {
  expect,
  test,
  OWNER,
  SYSTEM,
  apps,
  employeeServices,
  googleScanSetup,
} from "#test/support";

test("finds exactly the employees suspended in the Google directory", async ({
  orm,
  fakeGoogle,
}) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);
  await scans.runScan(SYSTEM, sourceId);
  const { edges } = await employeeServices(orm).listEmployees(OWNER, { first: 100 });
  const ana = edges.find(({ node }) => node.email === "ana@acme.example")!.node;
  const ben = edges.find(({ node }) => node.email === "ben@acme.example")!.node;

  const suspended = await apps(orm).findEmployeesSuspendedInDirectory(orm);

  expect(suspended.sort()).toEqual([ana.id, ben.id].sort());
});

test("identifies Google Workspace as the directory after the scan", async ({ orm, fakeGoogle }) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);
  await scans.runScan(SYSTEM, sourceId);
  const service = apps(orm);
  const { edges } = await service.listApps(OWNER, { status: "approved" });
  const google = edges.find(({ node }) => node.name === "Google Workspace")!.node;

  expect(await service.directoryAppId(orm)).toBe(google.id);
});

test("has no directory or suspended employees before Google Workspace is connected", async ({
  orm,
}) => {
  const service = apps(orm);

  expect(await service.directoryAppId(orm)).toBeNull();
  expect(await service.findEmployeesSuspendedInDirectory(orm)).toEqual([]);
});
