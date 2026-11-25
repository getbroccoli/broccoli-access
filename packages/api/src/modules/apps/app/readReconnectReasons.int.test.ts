import {
  connectLinear,
  createAppConnectionService,
  expect,
  failLinearCall,
  pendingDisable,
  postFakeControl,
  storedRecordHistory,
  SYSTEM,
  test,
  TEST_SECRET_BOX,
} from "#test/support";

const connections = createAppConnectionService({ secretBox: TEST_SECRET_BOX });

test("reads the cause and time of a scan that found a connection error", async ({
  orm,
  fakeConnectors,
}) => {
  const linear = await connectLinear(orm, fakeConnectors.url);
  await failLinearCall(fakeConnectors.url, "accounts/list", "permission_missing");
  await linear.scans.runScan(SYSTEM, linear.sourceId);
  const line = (await storedRecordHistory(orm)).find(
    (line) => line.recordId === linear.connectionId && line.causeKind === "connector_error",
  );

  const reasons = await connections.readReconnectReasons(orm, [linear.connectionId]);

  expect(line).toBeDefined();
  expect(reasons.get(linear.connectionId)).toEqual({
    cause: "permission_missing",
    foundAt: line!.occurredAt,
    foundByChange: null,
  });
});

test("identifies the account change that found the revoked key", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const pending = await pendingDisable(orm, seed, fakeConnectors.url);
  await postFakeControl(fakeConnectors.url, "linear/keys/revoke");
  await pending.service.runChange(SYSTEM, pending.change.id);

  const reasons = await connections.readReconnectReasons(orm, [pending.linear.connectionId]);

  expect(reasons.get(pending.linear.connectionId)).toMatchObject({
    cause: "authentication_failed",
    foundByChange: { id: pending.change.id },
  });
});

test("leaves a connected app out of the reconnect reasons", async ({ orm, fakeConnectors }) => {
  const linear = await connectLinear(orm, fakeConnectors.url);

  const reasons = await connections.readReconnectReasons(orm, [linear.connectionId]);

  expect(reasons.has(linear.connectionId)).toBe(false);
});
