import {
  expect,
  integrationUserTest as test,
  integrationUsers,
  recordingJobQueue,
  scans,
  storedImportSources,
  SYSTEM,
} from "#test/support";

test("queues a scan of the directory once the integration user is created", async ({
  workspace,
  orm,
  fakeGoogle,
}) => {
  const [source] = await storedImportSources(orm);
  await scans(orm, { googleUrl: fakeGoogle.url }).runScan(SYSTEM, source!.id);
  const { jobs, sent } = recordingJobQueue();
  const users = integrationUsers(orm, { googleUrl: fakeGoogle.url, jobs });

  await users.finishCreation(workspace.owner, await workspace.allowCreation());

  expect(sent).toEqual([{ name: "imports.scanConnection", payload: { sourceId: source!.id } }]);
  expect(await storedImportSources(orm)).toMatchObject([{ status: "scanning" }]);
});
