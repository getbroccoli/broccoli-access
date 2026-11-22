import {
  expect,
  test,
  OWNER,
  EMPLOYEE,
  SYSTEM,
  googleScanSetup,
  recordingJobQueue,
  storedImportSources,
  storedImportRecords,
  storedEmployees,
  storedAppAccounts,
  storedRecordHistory,
} from "#test/support";

test("a second request for a queued scan returns its source without queuing another job", async ({
  orm,
  fakeGoogle,
  transact,
}) => {
  const { jobs, sent } = recordingJobQueue();
  const { scans, sourceId, connectionId } = await googleScanSetup(orm, fakeGoogle.url, jobs);

  const result = await transact((tx) =>
    scans.scanConnection(OWNER, tx, { connectionId, sourceName: "acme.example" }),
  );

  expect(result).toEqual({ sourceId });
  expect(await storedImportSources(orm)).toMatchObject([{ id: sourceId, status: "scanning" }]);
  expect(sent).toEqual([{ name: "imports.scanConnection", payload: { sourceId } }]);
});

test("refuses a scan without MANAGE_WORKSPACE and writes nothing", async ({
  orm,
  fakeGoogle,
  transact,
}) => {
  const { jobs, sent } = recordingJobQueue();
  const { scans, sourceId, connectionId } = await googleScanSetup(orm, fakeGoogle.url, jobs);
  await scans.runScan(SYSTEM, sourceId);
  const before = {
    sources: await storedImportSources(orm),
    records: await storedImportRecords(orm),
    people: await storedEmployees(orm),
    accounts: await storedAppAccounts(orm),
    history: await storedRecordHistory(orm),
  };
  sent.length = 0;

  await expect(
    transact((tx) =>
      scans.scanConnection(EMPLOYEE, tx, { connectionId, sourceName: "acme.example" }),
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(sent).toEqual([]);
  expect({
    sources: await storedImportSources(orm),
    records: await storedImportRecords(orm),
    people: await storedEmployees(orm),
    accounts: await storedAppAccounts(orm),
    history: await storedRecordHistory(orm),
  }).toEqual(before);
});
