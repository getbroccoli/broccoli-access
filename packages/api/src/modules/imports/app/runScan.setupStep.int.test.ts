import {
  expect,
  test,
  SYSTEM,
  googleScanSetup,
  instances,
  failFakeGoogle,
  storedImportSources,
} from "#test/support";

test("a successful scan moves setup from the scan to selecting apps", async ({
  orm,
  fakeGoogle,
}) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);
  expect((await instances.readInstance(orm)).step).toBe("scan");

  await scans.runScan(SYSTEM, sourceId);

  expect((await instances.readInstance(orm)).step).toBe("select_apps");
});

test("a failed scan leaves setup at the scan", async ({ orm, fakeGoogle }) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);
  await failFakeGoogle(fakeGoogle.url, {
    endpoint: "directory.tokens.list",
    error: "permission_missing",
    count: 1,
  });

  await scans.runScan(SYSTEM, sourceId);

  expect(await storedImportSources(orm)).toMatchObject([
    { id: sourceId, status: "scan_failed", failure: "permission_missing" },
  ]);
  expect((await instances.readInstance(orm)).step).toBe("scan");
});
