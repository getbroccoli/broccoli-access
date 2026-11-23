import {
  accountChanges,
  expect,
  linearMemberStatus,
  pendingDisableTest as test,
  postFakeControl,
  serveManifest,
  storedAppConnections,
  storedRecordHistory,
  SYSTEM,
} from "#test/support";

test("turns Linear to Reconnect and records the change that found its revoked key", async ({
  orm,
  pending,
  fakeConnectors,
}) => {
  await postFakeControl(fakeConnectors.url, "linear/keys/revoke");

  await pending.service.runChange(SYSTEM, pending.change.id);

  expect(await pending.latest()).toMatchObject({
    status: "failed",
    error: "authentication_failed",
    attempts: [{ runtime: "server", error: "authentication_failed" }],
  });
  expect(await storedAppConnections(orm)).toMatchObject([
    {
      id: pending.change.connectionId,
      status: "reconnect",
      reconnectCause: "authentication_failed",
    },
  ]);
  expect(
    (await storedRecordHistory(orm)).filter((line) => line.causeKind === "connector_error"),
  ).toMatchObject([
    {
      recordType: "app_connection",
      recordId: pending.change.connectionId,
      operation: "updated",
      authorKind: "broccoli_itself",
      causeRef: pending.change.id,
    },
  ]);
});

test("fails a queued change with the connection's reconnect cause without disabling the Linear member", async ({
  pending,
  seed,
  fakeConnectors,
}) => {
  await seed.connectionNeedsReconnect(pending.change.connectionId);

  await pending.service.runChange(SYSTEM, pending.change.id);

  expect(await pending.latest()).toMatchObject({
    status: "failed",
    error: "authentication_failed",
    attempts: [],
  });
  expect(await linearMemberStatus(fakeConnectors.url, pending.chloe.email)).toBe("active");
});

test("fails another waiting Linear change with the cause found by the first change", async ({
  pending,
  fakeConnectors,
}) => {
  const { service, linear, owner } = pending;
  const ana = linear.account("ana@acme.example").id;
  const waiting = await service.changeAccount(owner, { appAccountId: ana, action: "suspend" });
  await postFakeControl(fakeConnectors.url, "linear/keys/revoke");

  await service.runChange(SYSTEM, pending.change.id);

  const states = await service.readChangeStates(owner, [ana]);
  expect(states.get(ana)?.latestChange).toMatchObject({
    id: waiting.id,
    status: "failed",
    error: "authentication_failed",
  });
});

test("fails a change with the stored reconnect cause even after Linear leaves the connector list", async ({
  pending,
  orm,
  seed,
  fakeConnectors,
}) => {
  await seed.connectionNeedsReconnect(pending.change.connectionId);
  const server = await serveManifest(fakeConnectors.url, (manifest) => {
    manifest.connectors = manifest.connectors.filter(({ key }) => key !== "linear");
  });
  const service = accountChanges(orm, { connectorsUrl: server.url });

  await service.runChange(SYSTEM, pending.change.id);

  expect(await pending.latest()).toMatchObject({
    status: "failed",
    error: "authentication_failed",
    attempts: [],
  });
});
