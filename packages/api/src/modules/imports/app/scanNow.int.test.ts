import {
  expect,
  test,
  OWNER,
  EMPLOYEE,
  SYSTEM,
  googleScanSetup,
  recordingJobQueue,
  storedImportSources,
} from "#test/support";

test("Scan now after a finished scan queues one job and returns the scan scanning", async ({
  orm,
  fakeGoogle,
}) => {
  const { jobs, sent } = recordingJobQueue();
  const { scans, sourceId, connectionId } = await googleScanSetup(orm, fakeGoogle.url, jobs);
  await scans.runScan(SYSTEM, sourceId);
  expect(await scans.readScan(OWNER, connectionId)).toMatchObject({ status: "scanned" });
  sent.length = 0;

  const result = await scans.scanNow(OWNER, connectionId);

  expect(result).toMatchObject({ id: sourceId, status: "scanning" });
  expect(result).toEqual(await scans.readScan(OWNER, connectionId));
  expect(sent).toEqual([{ name: "imports.scanConnection", payload: { sourceId } }]);
});

test("a second Scan now while the scan is queued queues no other job", async ({
  orm,
  fakeGoogle,
}) => {
  const { jobs, sent } = recordingJobQueue();
  const { scans, sourceId, connectionId } = await googleScanSetup(orm, fakeGoogle.url, jobs);
  await scans.runScan(SYSTEM, sourceId);
  sent.length = 0;
  await scans.scanNow(OWNER, connectionId);

  const result = await scans.scanNow(OWNER, connectionId);

  expect(result).toMatchObject({ id: sourceId, status: "scanning" });
  expect(sent).toEqual([{ name: "imports.scanConnection", payload: { sourceId } }]);
});

test("refuses Scan now without MANAGE_WORKSPACE and queues nothing", async ({
  orm,
  fakeGoogle,
}) => {
  const { jobs, sent } = recordingJobQueue();
  const { scans, sourceId, connectionId } = await googleScanSetup(orm, fakeGoogle.url, jobs);
  await scans.runScan(SYSTEM, sourceId);
  const before = await storedImportSources(orm);
  sent.length = 0;

  await expect(scans.scanNow(EMPLOYEE, connectionId)).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(sent).toEqual([]);
  expect(await storedImportSources(orm)).toEqual(before);
});
