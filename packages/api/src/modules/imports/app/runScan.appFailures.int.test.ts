import {
  expect,
  test,
  OWNER,
  SYSTEM,
  googleScanSetup,
  storedApps,
  storedAppAccounts,
  storedImportRecords,
  storedRecordHistory,
  storedImportSources,
  grantAtFakeGoogle,
  failFakeGoogle,
} from "#test/support";

test.for(["directory.tokens.list", "reports.activities.list"])(
  "preserves apps, accounts, records and history after a failed %s rescan",
  async (endpoint, { orm, fakeGoogle, transact }) => {
    const { scans, sourceId, connectionId } = await googleScanSetup(orm, fakeGoogle.url);
    await scans.runScan(SYSTEM, sourceId);
    const before = {
      apps: await storedApps(orm),
      accounts: await storedAppAccounts(orm),
      records: await storedImportRecords(orm),
      history: await storedRecordHistory(orm),
    };
    await grantAtFakeGoogle(fakeGoogle.url, {
      email: "ana@acme.example",
      clientId: "new-app",
      appName: "Acme Sketch",
    });
    await failFakeGoogle(fakeGoogle.url, { endpoint, error: "permission_missing", count: 1 });
    await transact((tx) =>
      scans.scanConnection(OWNER, tx, { connectionId, sourceName: "acme.example" }),
    );

    await scans.runScan(SYSTEM, sourceId);

    expect(await storedImportSources(orm)).toMatchObject([
      { id: sourceId, status: "scan_failed", failure: "permission_missing" },
    ]);
    expect({
      apps: await storedApps(orm),
      accounts: await storedAppAccounts(orm),
      records: await storedImportRecords(orm),
      history: await storedRecordHistory(orm),
    }).toEqual(before);
  },
);

test("fails a rescan whose sign-in log stays rate limited and keeps the last apps and accounts", async ({
  orm,
  fakeGoogle,
  transact,
}) => {
  const { scans, sourceId, connectionId } = await googleScanSetup(orm, fakeGoogle.url);
  await scans.runScan(SYSTEM, sourceId);
  const before = {
    apps: await storedApps(orm),
    accounts: await storedAppAccounts(orm),
    records: await storedImportRecords(orm),
    history: await storedRecordHistory(orm),
  };
  await failFakeGoogle(fakeGoogle.url, {
    endpoint: "reports.activities.list",
    error: "rate_limited",
    count: 3,
  });
  await transact((tx) =>
    scans.scanConnection(OWNER, tx, { connectionId, sourceName: "acme.example" }),
  );

  await scans.runScan(SYSTEM, sourceId);

  expect(await storedImportSources(orm)).toMatchObject([
    { id: sourceId, status: "scan_failed", failure: "rate_limited" },
  ]);
  expect({
    apps: await storedApps(orm),
    accounts: await storedAppAccounts(orm),
    records: await storedImportRecords(orm),
    history: await storedRecordHistory(orm),
  }).toEqual(before);
});
