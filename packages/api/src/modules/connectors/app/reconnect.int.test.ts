import { inspect } from "node:util";

import type { ConnectionTestAnswer } from "@broccoli-access/connector-contract";
import { ACME_LINEAR, ACME_SLACK } from "@broccoli-access/fake-apps";
import express from "express";

import {
  connectLinear,
  containerConnections,
  createAppConnectionService,
  EMPLOYEE,
  expect,
  LINEAR_INPUT,
  OWNER,
  ownerHandOver,
  postFakeControl,
  serveConnectorRoutes,
  signInToFakeSlack,
  slackWithExpiredSession,
  storedAppConnections,
  storedImportSources,
  storedRecordHistory,
  SYSTEM,
  test,
  TEST_SECRET_BOX,
} from "#test/support";

test("reconnects Linear with a replacement key, records the status change and queues its scan", async ({
  orm,
  transact,
  fakeConnectors,
}) => {
  const linear = await connectLinear(orm, fakeConnectors.url);
  const connections = createAppConnectionService({ secretBox: TEST_SECRET_BOX });
  const oldKey = "previous-linear-key";
  await transact((tx) =>
    connections.changeConnection(OWNER, tx, linear.connectionId, { secrets: { apiKey: oldKey } }),
  );
  await postFakeControl(fakeConnectors.url, "linear/keys/revoke");
  await linear.scans.runScan(SYSTEM, linear.sourceId);
  await postFakeControl(fakeConnectors.url, "reset");
  const { service, sent } = containerConnections(orm, fakeConnectors.url);

  await service.reconnect(OWNER, LINEAR_INPUT);

  expect(await connections.readSecrets(orm, linear.connectionId)).toEqual({
    apiKey: ACME_LINEAR.apiKey,
  });
  expect(await storedAppConnections(orm)).toMatchObject([
    { id: linear.connectionId, status: "connected", reconnectCause: null },
  ]);
  const history = await storedRecordHistory(orm);
  const edits = history.filter(
    (line) =>
      line.recordId === linear.connectionId &&
      line.operation === "updated" &&
      line.causeKind === "edited_directly",
  );
  expect(edits).toMatchObject([{ authorKind: "signed_in_user", authorId: OWNER.user!.userId }]);
  expect(edits[0]!.changes).toContainEqual({
    field: "status",
    oldValue: "reconnect",
    newValue: "connected",
  });
  const historyText = inspect(history, { depth: null, maxArrayLength: null });
  expect(historyText).not.toContain(oldKey);
  expect(historyText).not.toContain(ACME_LINEAR.apiKey);
  expect(await storedImportSources(orm)).toMatchObject([
    { id: linear.sourceId, status: "scanning" },
  ]);
  expect(sent).toEqual([
    { name: "imports.scanConnection", payload: { sourceId: linear.sourceId } },
  ]);
});

test("refuses a key for another Linear workspace and changes nothing", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const linear = await connectLinear(orm, fakeConnectors.url);
  await linear.scans.runScan(SYSTEM, linear.sourceId);
  await seed.connectionNeedsReconnect(linear.connectionId);
  const before = await storedAppConnections(orm);
  const history = await storedRecordHistory(orm);
  const app = express();
  app.post("/v1/connections/test", (_request, response) =>
    response.json({
      details: { organizationName: "Acme", domain: null },
      connection: { settings: { ...ACME_LINEAR.settings, organizationId: "other-workspace" } },
    }),
  );
  const server = await serveConnectorRoutes(fakeConnectors.url, app);
  const { service, sent } = containerConnections(orm, server.url);

  await expect(
    service.reconnect(OWNER, {
      connector: "linear",
      values: [{ key: "apiKey", value: "other-key" }],
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "values", code: "wrong_workspace" }],
  });

  expect(await storedAppConnections(orm)).toEqual(before);
  expect(await storedRecordHistory(orm)).toEqual(history);
  expect(sent).toEqual([]);
});

test("reconnects Slack with the owner's new hand-over", async ({ orm, seed, fakeConnectors }) => {
  const slack = await slackWithExpiredSession(orm, seed, fakeConnectors);
  await slack.scans.runScan(SYSTEM, slack.sourceId);
  const session = await signInToFakeSlack(fakeConnectors);
  const requestId = "new-hand-over";
  await slack.service.handOverAppSession({
    requestId,
    userId: OWNER.user!.userId,
    connector: "slack",
    appSession: session,
  });
  const handOver = await slack.service.readAppSessionHandOver(OWNER, requestId);

  await slack.service.reconnect(OWNER, { connector: "slack", appSession: handOver!.appSession });

  const [connection] = await storedAppConnections(orm);
  expect(connection).toMatchObject({
    id: slack.connectionId,
    status: "connected",
    reconnectCause: null,
  });
  expect(
    JSON.parse(TEST_SECRET_BOX.decrypt(connection!.encryptedSecrets, slack.connectionId)),
  ).toEqual({ appSession: session });
});

test("refuses to reconnect Slack when the final test names another workspace without new settings", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const slack = await slackWithExpiredSession(orm, seed, fakeConnectors);
  await slack.scans.runScan(SYSTEM, slack.sourceId);
  const before = await storedAppConnections(orm);
  let answer: ConnectionTestAnswer = {
    details: { organizationName: ACME_SLACK.name, domain: "acme.slack.com" },
    connection: { settings: ACME_SLACK.settings },
  };
  const app = express();
  app.get("/slack/signin", (_req, res) => res.redirect(fakeConnectors.url + "/slack/signin"));
  app.post("/v1/connections/test", (_req, res) => res.json(answer));
  const server = await serveConnectorRoutes(fakeConnectors.url, app);
  const { service, handOver } = await ownerHandOver(orm, server);
  answer = { details: { organizationName: "Other", domain: "other.slack.com" } };

  await expect(
    service.reconnect(OWNER, { connector: "slack", appSession: handOver.appSession }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "appSession", code: "wrong_workspace" }],
  });

  expect(await storedAppConnections(orm)).toEqual(before);
});

test("refuses to reconnect Linear before it has a connection", async ({ orm, fakeConnectors }) => {
  const { service } = containerConnections(orm, fakeConnectors.url);

  await expect(service.reconnect(OWNER, LINEAR_INPUT)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("refuses to reconnect Linear for an employee", async ({ orm, fakeConnectors }) => {
  await connectLinear(orm, fakeConnectors.url);
  const { service } = containerConnections(orm, fakeConnectors.url);

  await expect(service.reconnect(EMPLOYEE, LINEAR_INPUT)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
