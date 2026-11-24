import { inspect } from "node:util";

import {
  CONNECTOR_MANIFEST,
  type AppSession,
  type ConnectionTestAnswer,
} from "@broccoli-access/connector-contract";
import express, { type RequestHandler } from "express";
import { onTestFinished } from "vitest";

import {
  expect,
  test,
  OWNER,
  SYSTEM,
  containerConnections,
  ownerHandOver,
  startSimpleHttpServer,
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
  expect(members.filter((member) => member.appId === apps[0]!.id)).toHaveLength(44);
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

test("refuses to connect a workspace other than the one the owner confirmed and saves nothing", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const owner = OWNER.user!;
  await seed.user({ id: owner.userId, email: owner.email });
  let settings = ACME_SETTINGS;
  const { server } = await slackContainer(fakeConnectors.url, (_req, res) =>
    res.json({ details: ACME_DETAILS, connection: { settings } }),
  );
  const { service, handOver, sent } = await ownerHandOver(orm, server);
  settings = { teamId: "T09OTHER", teamDomain: "other", teamName: "Other" };

  await expect(
    service.connect(OWNER, {
      connector: "slack",
      appSession: handOver.appSession,
      noticeAccepted: true,
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "appSession", code: "wrong_workspace" }],
  });
  expect(await storedAppConnections(orm)).toEqual([]);
  expect(sent).toEqual([]);
});

test("refuses to connect when the second test names another workspace without new settings", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const owner = OWNER.user!;
  await seed.user({ id: owner.userId, email: owner.email });
  let answer: ConnectionTestAnswer = {
    details: ACME_DETAILS,
    connection: { settings: ACME_SETTINGS },
  };
  const { server } = await slackContainer(fakeConnectors.url, (_req, res) => res.json(answer));
  const { service, handOver, sent } = await ownerHandOver(orm, server);
  answer = { details: { organizationName: "Other", domain: "other.slack.com" } };

  await expect(
    service.connect(OWNER, {
      connector: "slack",
      appSession: handOver.appSession,
      noticeAccepted: true,
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "appSession", code: "wrong_workspace" }],
  });
  expect(await storedAppConnections(orm)).toEqual([]);
  expect(sent).toEqual([]);
});

test("connects with the session the first test renewed", async ({ orm, seed, fakeConnectors }) => {
  const owner = OWNER.user!;
  await seed.user({ id: owner.userId, email: owner.email });
  const renewed: AppSession = {
    cookies: [
      {
        name: "d",
        value: "renewed",
        domain: "slack.localhost",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ],
    storage: { localConfig_v2: "{}" },
  };
  let answer: ConnectionTestAnswer = {
    details: ACME_DETAILS,
    connection: { settings: ACME_SETTINGS, secrets: { appSession: renewed } },
  };
  let received: unknown;
  const { server } = await slackContainer(fakeConnectors.url, (req, res) => {
    received = req.body;
    res.json(answer);
  });
  const { service, handOver } = await ownerHandOver(orm, server);
  answer = { details: ACME_DETAILS, connection: { settings: ACME_SETTINGS } };

  const saved = await service.connect(OWNER, {
    connector: "slack",
    appSession: handOver.appSession,
    noticeAccepted: true,
  });

  expect(received).toHaveProperty("connection.secrets.appSession.cookies.0.value", "renewed");
  const [connection] = await storedAppConnections(orm);
  expect(
    JSON.parse(TEST_SECRET_BOX.decrypt(connection!.encryptedSecrets, saved.connection!.id)),
  ).toEqual({ appSession: renewed });
});

test("refuses a sealed session holding a storage key the connector no longer names", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const owner = OWNER.user!;
  await seed.user({ id: owner.userId, email: owner.email });
  const { server, manifest } = await slackContainer(fakeConnectors.url, (_req, res) =>
    res.json({ details: ACME_DETAILS, connection: { settings: ACME_SETTINGS } }),
  );
  const { handOver } = await ownerHandOver(orm, server);
  const slack = manifest.connectors.find(({ key }) => key === "slack")!;
  const field = slack.connectionFields.find((candidate) => candidate.kind === "app_session")!;
  expect(field.storageKeys).toEqual(["localConfig_v2"]);
  field.storageKeys = [];
  const { service, sent } = containerConnections(orm, server.url);

  await expect(
    service.connect(OWNER, {
      connector: "slack",
      appSession: handOver.appSession,
      noticeAccepted: true,
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "appSession", code: "invalid" }],
  });
  expect(await storedAppConnections(orm)).toEqual([]);
  expect(sent).toEqual([]);
});

const ACME_SETTINGS = { teamId: "T04ACME", teamDomain: "acme", teamName: "Acme" };
const ACME_DETAILS = { organizationName: "Acme", domain: "acme.slack.com" };

async function slackContainer(fakeUrl: string, connectionTest: RequestHandler) {
  const response = await fetch(new URL("/v1/connectors", fakeUrl));
  const manifest = CONNECTOR_MANIFEST.parse(await response.json());
  const container = express();
  container.get("/v1/connectors", (_req, res) => res.json(manifest));
  container.get("/slack/signin", (_req, res) => res.redirect(fakeUrl + "/slack/signin"));
  container.post("/v1/connections/test", express.json(), connectionTest);
  const server = await startSimpleHttpServer(container);
  onTestFinished(() => server.stop());
  return { server, manifest };
}
