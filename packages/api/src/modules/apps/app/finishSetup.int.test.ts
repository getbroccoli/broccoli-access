import {
  expect,
  test,
  OWNER,
  EMPLOYEE,
  SYSTEM,
  apps,
  googleScanSetup,
  instances,
  storedApps,
  storedRecordHistory,
} from "#test/support";

test("finishes setup with the selected apps and Google Workspace approved", async ({
  orm,
  fakeGoogle,
}) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);
  await scans.runScan(SYSTEM, sourceId);
  const service = apps(orm);
  const { edges } = await service.listApps(OWNER, { status: "discovered" });
  const approvedAppIds = edges
    .filter(({ node }) => ["Slack", "Figma"].includes(node.name))
    .map(({ node }) => node.id);

  await service.finishSetup(OWNER, { approvedAppIds });

  expect(await service.countApps(OWNER)).toEqual({ approved: 3, discovered: 0, ignored: 35 });
  expect(
    (await service.listApps(OWNER, { status: "approved" })).edges.map(({ node }) => node.name),
  ).toEqual(["Google Workspace", "Slack", "Figma"]);
  expect((await instances.readInstance(orm)).step).toBe("done");
});

test("follows the owner's selection of ChatGPT instead of Slack", async ({ orm, fakeGoogle }) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);
  await scans.runScan(SYSTEM, sourceId);
  const service = apps(orm);
  const { edges } = await service.listApps(OWNER, { status: "discovered" });
  const chatgpt = edges.find(({ node }) => node.name === "ChatGPT")!.node;

  await service.finishSetup(OWNER, { approvedAppIds: [chatgpt.id] });

  const saved = await storedApps(orm);
  expect(saved.find(({ name }) => name === "ChatGPT")!.status).toBe("approved");
  expect(saved.find(({ name }) => name === "Slack")!.status).toBe("ignored");
  expect(await service.countApps(OWNER)).toEqual({ approved: 2, discovered: 0, ignored: 36 });
});

test("records one owner-authored status change per discovered app and none for Google Workspace", async ({
  orm,
  fakeGoogle,
}) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);
  await scans.runScan(SYSTEM, sourceId);
  const service = apps(orm);
  const { edges } = await service.listApps(OWNER, { status: "discovered" });
  const approvedAppIds = [edges.find(({ node }) => node.name === "Slack")!.node.id];
  const before = await storedRecordHistory(orm);

  await service.finishSetup(OWNER, { approvedAppIds });

  const history = await storedRecordHistory(orm);
  expect(history.slice(0, before.length)).toEqual(before);
  const added = history.slice(before.length);
  expect(added).toHaveLength(37);
  for (const { node } of edges) {
    expect(added.filter(({ recordId }) => recordId === node.id)).toMatchObject([
      {
        recordType: "app",
        operation: "updated",
        authorKind: "signed_in_user",
        authorId: "test-owner",
        causeKind: "edited_directly",
        changes: [
          {
            field: "status",
            oldValue: "discovered",
            newValue: approvedAppIds.includes(node.id) ? "approved" : "ignored",
          },
        ],
      },
    ]);
  }
  const google = (await storedApps(orm)).find(({ name }) => name === "Google Workspace")!;
  expect(added.filter(({ recordId }) => recordId === google.id)).toEqual([]);
});

test("refuses to finish setup twice without changing apps, history or the step", async ({
  orm,
  fakeGoogle,
}) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);
  await scans.runScan(SYSTEM, sourceId);
  const service = apps(orm);
  const { edges } = await service.listApps(OWNER, { status: "discovered" });
  const slack = edges.find(({ node }) => node.name === "Slack")!.node;
  await service.finishSetup(OWNER, { approvedAppIds: [slack.id] });
  const before = { apps: await storedApps(orm), history: await storedRecordHistory(orm) };

  await expect(service.finishSetup(OWNER, { approvedAppIds: [] })).rejects.toMatchObject({
    code: "CONFLICT",
  });

  expect({ apps: await storedApps(orm), history: await storedRecordHistory(orm) }).toEqual(before);
  expect((await instances.readInstance(orm)).step).toBe("done");
});

test("refuses a selected app that is not discovered without changing apps, history or the step", async ({
  orm,
  fakeGoogle,
}) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);
  await scans.runScan(SYSTEM, sourceId);
  const before = { apps: await storedApps(orm), history: await storedRecordHistory(orm) };
  const google = before.apps.find(({ name }) => name === "Google Workspace")!;
  const slack = before.apps.find(({ name }) => name === "Slack")!;

  await expect(
    apps(orm).finishSetup(OWNER, { approvedAppIds: [slack.id, google.id] }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "approvedAppIds", code: "invalid" }],
  });

  expect({ apps: await storedApps(orm), history: await storedRecordHistory(orm) }).toEqual(before);
  expect((await instances.readInstance(orm)).step).toBe("select_apps");
});

test("refuses to finish setup without MANAGE_WORKSPACE and changes nothing", async ({
  orm,
  fakeGoogle,
}) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);
  await scans.runScan(SYSTEM, sourceId);
  const before = { apps: await storedApps(orm), history: await storedRecordHistory(orm) };

  await expect(apps(orm).finishSetup(EMPLOYEE, { approvedAppIds: [] })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });

  expect({ apps: await storedApps(orm), history: await storedRecordHistory(orm) }).toEqual(before);
  expect((await instances.readInstance(orm)).step).toBe("select_apps");
});
