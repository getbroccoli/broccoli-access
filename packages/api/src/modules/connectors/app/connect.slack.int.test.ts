import { inspect } from "node:util";

import {
  expect,
  test,
  OWNER,
  SYSTEM,
  ownerHandOver,
  storedApps,
  storedAppConnections,
  storedAppAccounts,
  storedImportSources,
  storedImportRecords,
  storedRecordHistory,
  TEST_SECRET_BOX,
} from "#test/support";

test("connects Slack with the handed-over session, records the notice and queues its scan", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const owner = OWNER.user!;
  await seed.user({ id: owner.userId, email: owner.email });
  let now = new Date("2026-01-01T12:00:00Z");
  const { service, handOver, appSession, sent, scans } = await ownerHandOver(
    orm,
    fakeConnectors,
    () => now,
  );
  now = new Date("2026-01-01T12:02:00Z");

  const result = await service.connect(OWNER, {
    connector: "slack",
    appSession: handOver.appSession,
    noticeAccepted: true,
  });

  const connectionId = result.connection!.id;
  expect(result.connection!.noticeAcceptedAt).toEqual(now);
  const apps = await storedApps(orm);
  expect(apps).toMatchObject([{ name: "Slack", catalogKey: "slack", status: "approved" }]);
  const connections = await storedAppConnections(orm);
  expect(connections).toMatchObject([
    {
      id: connectionId,
      appId: apps[0]!.id,
      connector: "slack",
      noticeAcceptedAt: now,
      noticeAcceptedBy: owner.userId,
    },
  ]);
  const { encryptedSecrets, settings } = connections[0]!;
  expect(settings).toEqual({ teamId: "T04ACME", teamDomain: "acme", teamName: "Acme" });
  expect(encryptedSecrets).not.toContain(appSession.cookies[0]!.value);
  expect(JSON.parse(TEST_SECRET_BOX.decrypt(encryptedSecrets, connectionId))).toEqual({
    appSession,
  });
  const history = await storedRecordHistory(orm);
  const creation = history.find((line) => line.recordId === connectionId);
  expect(creation).toMatchObject({
    recordType: "app_connection",
    operation: "created",
    causeKind: "edited_directly",
    authorKind: "signed_in_user",
    authorId: owner.userId,
  });
  expect(creation!.changes).toContainEqual({
    field: "noticeAcceptedAt",
    oldValue: null,
    newValue: now.toISOString(),
  });
  const historyText = inspect(history, { depth: null });
  expect(historyText).not.toContain(appSession.cookies[0]!.value);
  expect(historyText).not.toContain("xoxc-");

  const sources = await storedImportSources(orm);
  expect(sources).toMatchObject([{ connectionId }]);
  const sourceId = sources[0]!.id;
  expect(sent).toEqual([{ name: "imports.scanConnection", payload: { sourceId } }]);
  await scans.runScan(SYSTEM, sourceId);

  const members = await storedAppAccounts(orm);
  expect(members.filter((member) => member.appId === apps[0]!.id)).toHaveLength(41);
  expect(members.find((member) => member.email === "elif@acme.example")?.status).toBe("suspended");
  expect(await storedImportRecords(orm)).toContainEqual(
    expect.objectContaining({
      sourceId,
      values: expect.objectContaining({
        email: "admin@acme.example",
        isConnectionUser: true,
      }) as unknown,
    }),
  );
});
