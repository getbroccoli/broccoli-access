import {
  expect,
  test,
  OWNER,
  EMPLOYEE,
  SYSTEM,
  googleScanSetup,
  failFakeGoogle,
} from "#test/support";

test("a queued scan shows people running with no counts", async ({ orm, fakeGoogle }) => {
  const { scans, sourceId, connectionId } = await googleScanSetup(orm, fakeGoogle.url);

  const scan = await scans.readScan(OWNER, connectionId);

  expect(scan).toEqual({
    id: sourceId,
    status: "scanning",
    failure: null,
    readAt: null,
    people: { state: "running", count: null, suspended: null },
    apps: { state: "waiting", count: null },
    signInLogs: { state: "waiting" },
  });
});

test("a failed first scan shows its failure and people failed", async ({ orm, fakeGoogle }) => {
  const { scans, sourceId, connectionId } = await googleScanSetup(orm, fakeGoogle.url);
  await failFakeGoogle(fakeGoogle.url, {
    endpoint: "directory.users.list",
    error: "permission_missing",
    count: 1,
  });
  await scans.runScan(SYSTEM, sourceId);

  const scan = await scans.readScan(OWNER, connectionId);

  expect(scan).toEqual({
    id: sourceId,
    status: "scan_failed",
    failure: "permission_missing",
    readAt: null,
    people: { state: "failed", count: null, suspended: null },
    apps: { state: "failed", count: null },
    signInLogs: { state: "failed" },
  });
});

test("refuses reading a scan without MANAGE_WORKSPACE", async ({ orm, fakeGoogle }) => {
  const { scans, connectionId } = await googleScanSetup(orm, fakeGoogle.url);

  await expect(scans.readScan(EMPLOYEE, connectionId)).rejects.toMatchObject({ code: "FORBIDDEN" });
});
