import type { AccountsListAnswer, ConnectorErrorAnswer } from "@broccoli-access/connector-contract";
import { ACME_LINEAR } from "@broccoli-access/fake-apps";

import {
  connectLinear,
  containerConnections,
  createAppConnectionService,
  expect,
  failLinearCall,
  googleScanSetup,
  LINEAR_INPUT,
  OWNER,
  pendingDisable,
  postFakeControl,
  scannedLinear,
  serveAccountList,
  slackWithExpiredSession,
  storedAppConnections,
  storedImportSources,
  storedRecordHistory,
  SYSTEM,
  test,
  TEST_SECRET_BOX,
  testTransactor,
} from "#test/support";

import type { Orm } from "../../../core/db";

const connections = createAppConnectionService({ secretBox: TEST_SECRET_BOX });

test("turns Slack to Reconnect when its session expires and records which scan found it", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const slack = await slackWithExpiredSession(orm, seed, fakeConnectors);

  await slack.scans.runScan(SYSTEM, slack.sourceId);

  expect(await storedImportSources(orm)).toMatchObject([
    { id: slack.sourceId, status: "scan_failed", failure: "authentication_failed" },
  ]);
  expect(await storedAppConnections(orm)).toMatchObject([
    { id: slack.connectionId, status: "reconnect", reconnectCause: "authentication_failed" },
  ]);
  const errors = (await storedRecordHistory(orm)).filter(
    (line) => line.causeKind === "connector_error",
  );
  expect(errors).toMatchObject([
    {
      recordType: "app_connection",
      recordId: slack.connectionId,
      operation: "updated",
      authorKind: "broccoli_itself",
      causeRef: slack.sourceId,
    },
  ]);
  expect(errors[0]!.changes).toEqual(
    expect.arrayContaining([
      { field: "status", oldValue: "connected", newValue: "reconnect" },
      { field: "reconnectCause", oldValue: null, newValue: "authentication_failed" },
    ]),
  );
});

test.for(["permission_missing", "wrong_workspace"] as const)(
  "turns Linear to Reconnect when its scan fails with %s",
  async (code, { orm, fakeConnectors }) => {
    const linear = await connectLinear(orm, fakeConnectors.url);
    await failLinearCall(fakeConnectors.url, "accounts/list", code);

    await linear.scans.runScan(SYSTEM, linear.sourceId);

    expect(await storedAppConnections(orm)).toMatchObject([
      { id: linear.connectionId, status: "reconnect", reconnectCause: code },
    ]);
  },
);

test("keeps Linear connected when its scan stays rate-limited", async ({ orm, fakeConnectors }) => {
  const linear = await connectLinear(orm, fakeConnectors.url);
  await failLinearCall(fakeConnectors.url, "accounts/list", "rate_limited", 3);

  await linear.scans.runScan(SYSTEM, linear.sourceId);

  expect(await storedImportSources(orm)).toMatchObject([
    { status: "scan_failed", failure: "rate_limited" },
  ]);
  expect(await storedAppConnections(orm)).toMatchObject([
    { status: "connected", reconnectCause: null },
  ]);
  expect(
    (await storedRecordHistory(orm)).filter((line) => line.causeKind === "connector_error"),
  ).toEqual([]);
});

test("fails the connection's running change with the cause found by its scan", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const pending = await pendingDisable(orm, seed, fakeConnectors.url);
  const { linear } = pending;
  await postFakeControl(fakeConnectors.url, "linear/keys/revoke");
  await linear.scans.scanNow(OWNER, linear.connectionId);

  await linear.scans.runScan(SYSTEM, linear.sourceId);

  expect(await pending.latest()).toMatchObject({
    id: pending.change.id,
    status: "failed",
    error: "authentication_failed",
  });
});

test("keeps Google Workspace connected when its refresh token is revoked", async ({
  orm,
  fakeGoogle,
}) => {
  const google = await googleScanSetup(orm, fakeGoogle.url);
  await postFakeControl(fakeGoogle.url, "tokens/revoke");

  await google.scans.runScan(SYSTEM, google.sourceId);

  expect(await storedImportSources(orm)).toMatchObject([
    { status: "scan_failed", failure: "authentication_failed" },
  ]);
  expect(await storedAppConnections(orm)).toMatchObject([
    { status: "connected", reconnectCause: null },
  ]);
});

test("keeps the original connector error history line when a second scan fails", async ({
  orm,
  fakeConnectors,
}) => {
  const linear = await connectLinear(orm, fakeConnectors.url);
  await postFakeControl(fakeConnectors.url, "linear/keys/revoke");
  await linear.scans.runScan(SYSTEM, linear.sourceId);
  const original = (await storedRecordHistory(orm)).filter(
    (line) => line.causeKind === "connector_error",
  );
  expect(original).toHaveLength(1);
  await linear.scans.scanNow(OWNER, linear.connectionId);

  await linear.scans.runScan(SYSTEM, linear.sourceId);

  expect(await storedImportSources(orm)).toMatchObject([{ status: "scan_failed" }]);
  expect(
    (await storedRecordHistory(orm)).filter((line) => line.causeKind === "connector_error"),
  ).toEqual(original);
});

test("keeps Linear connected when a scan using the replaced key fails after reconnect", async ({
  orm,
  fakeConnectors,
}) => {
  const { scans, connectionId, sourceId } = await reconnectDuringScan(orm, fakeConnectors.url, {
    error: { code: "authentication_failed" },
  });

  await scans.runScan(SYSTEM, sourceId);

  expect(await storedAppConnections(orm)).toMatchObject([
    { id: connectionId, status: "connected", reconnectCause: null },
  ]);
  expect(
    (await storedRecordHistory(orm)).filter(
      (line) => line.recordId === connectionId && line.causeKind === "connector_error",
    ),
  ).toEqual([]);
  expect(await connections.readSecrets(orm, connectionId)).toEqual({ apiKey: ACME_LINEAR.apiKey });
});

test("keeps the reconnected key when a scan using the replaced key returns renewed secrets", async ({
  orm,
  fakeConnectors,
}) => {
  const { scans, connectionId, sourceId } = await reconnectDuringScan(orm, fakeConnectors.url, {
    accounts: [],
    nextCursor: null,
    connection: { secrets: { apiKey: "renewed-old-key" } },
  });

  await scans.runScan(SYSTEM, sourceId);

  expect(await connections.readSecrets(orm, connectionId)).toEqual({ apiKey: ACME_LINEAR.apiKey });
});

async function reconnectDuringScan(
  orm: Orm,
  url: string,
  answer: AccountsListAnswer | ConnectorErrorAnswer,
) {
  const linear = await scannedLinear(orm, url);
  await testTransactor(orm)((tx) =>
    connections.changeConnection(OWNER, tx, linear.connectionId, {
      secrets: { apiKey: "old-key" },
    }),
  );
  await linear.scans.scanNow(OWNER, linear.connectionId);
  const { service } = containerConnections(orm, url);
  const server = await serveAccountList(url, async (_request, response) => {
    await service.reconnect(OWNER, LINEAR_INPUT);
    response.json(answer);
  });
  return {
    connectionId: linear.connectionId,
    sourceId: linear.sourceId,
    scans: containerConnections(orm, server.url).scans,
  };
}
