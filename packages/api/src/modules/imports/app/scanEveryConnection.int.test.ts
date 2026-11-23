import {
  connectLinear,
  expect,
  googleScanSetup,
  OWNER,
  recordingJobQueue,
  scannedLinear,
  scans,
  storedImportSources,
  SYSTEM,
  test,
} from "#test/support";

test("queues one scan per connection, including Google Workspace", async ({
  orm,
  fakeGoogle,
  fakeConnectors,
}) => {
  const google = await googleScanSetup(orm, fakeGoogle.url);
  await google.scans.runScan(SYSTEM, google.sourceId);
  const linear = await scannedLinear(orm, fakeConnectors.url);
  const { jobs, sent } = recordingJobQueue();

  await scans(orm, { jobs }).scanEveryConnection(SYSTEM);

  const ids = [google.sourceId, linear.sourceId].sort();
  expect((await storedImportSources(orm)).map(({ id, status }) => ({ id, status }))).toEqual(
    ids.map((id) => ({ id, status: "scanning" })),
  );
  expect(sent).toHaveLength(2);
  for (const sourceId of ids) {
    expect(sent).toContainEqual({ name: "imports.scanConnection", payload: { sourceId } });
  }
});

test("queues no second scan when the connection's scan is already queued", async ({
  orm,
  fakeConnectors,
}) => {
  await connectLinear(orm, fakeConnectors.url);
  const { jobs, sent } = recordingJobQueue();

  await scans(orm, { jobs }).scanEveryConnection(SYSTEM);

  expect(sent).toEqual([]);
});

test("only the system can queue the daily scans", async ({ orm }) => {
  await expect(scans(orm, {}).scanEveryConnection(OWNER)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
