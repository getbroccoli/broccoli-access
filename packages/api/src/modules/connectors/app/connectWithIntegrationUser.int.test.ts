import { inspect } from "node:util";

import { INTEGRATION_USER_TOTP_SECRET } from "@broccoli-access/fake-apps";
import express from "express";

import {
  expect,
  test,
  OWNER,
  SYSTEM,
  connectAsIntegrationUser,
  containerConnections,
  INTEGRATION_USER_EMAIL,
  INTEGRATION_USER_PASSWORD,
  inviteIntegrationUserToFakeSlack,
  ownerHandOver,
  readyIntegrationUser,
  serveConnectorRoutes,
  storedAppAccounts,
  storedAppConnections,
  storedImportRecords,
  storedImportSources,
  storedRecordHistory,
  TEST_SECRET_BOX,
} from "#test/support";

const SLACK = { connector: "slack", noticeAccepted: true };

test("connects the confirmed workspace with the integration user's session, and scans as it", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  let now = new Date("2026-01-01T12:00:00Z");
  const { service, scans, sent } = await readyIntegrationUser(orm, seed, fakeConnectors, () => now);
  await inviteIntegrationUserToFakeSlack(fakeConnectors, "admin");

  const { handOver } = await service.connectWithIntegrationUser(OWNER, SLACK);
  now = new Date("2026-01-01T12:01:00Z");
  const result = await service.connect(OWNER, { ...SLACK, appSession: handOver!.appSession });

  expect(result.connection).toMatchObject({ sessionFrom: "server_sign_in", noticeAcceptedAt: now });
  expect(await storedAppConnections(orm)).toMatchObject([
    {
      id: result.connection!.id,
      connector: "slack",
      sessionFrom: "server_sign_in",
      settings: { teamId: "T04ACME", teamDomain: "acme", teamName: "Acme" },
      noticeAcceptedBy: OWNER.user!.userId,
    },
  ]);
  const [source] = await storedImportSources(orm);
  expect(sent).toEqual([{ name: "imports.scanConnection", payload: { sourceId: source!.id } }]);
  await scans.runScan(SYSTEM, source!.id);
  expect(await storedImportRecords(orm)).toContainEqual(
    expect.objectContaining({
      values: expect.objectContaining({
        email: INTEGRATION_USER_EMAIL,
        isConnectionUser: true,
      }) as unknown,
    }),
  );
});

test("stores nothing until the owner confirms the workspace the sign-in reached", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const { service, sent } = await readyIntegrationUser(orm, seed, fakeConnectors);
  await inviteIntegrationUserToFakeSlack(fakeConnectors, "admin");

  const result = await service.connectWithIntegrationUser(OWNER, SLACK);

  expect(result).toMatchObject({
    connection: null,
    handOver: {
      requestId: expect.any(String) as unknown,
      organizationName: "Acme",
      domain: "acme.slack.com",
      appSession: expect.any(String) as unknown,
    },
  });
  expect(await storedAppConnections(orm)).toEqual([]);
  expect(sent).toEqual([]);
});

test("lets the owner read the sign-in hand-over for five minutes", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  let now = new Date("2026-01-01T12:00:00Z");
  const { service } = await readyIntegrationUser(orm, seed, fakeConnectors, () => now);
  await inviteIntegrationUserToFakeSlack(fakeConnectors, "admin");
  const { handOver } = await service.connectWithIntegrationUser(OWNER, SLACK);

  now = new Date("2026-01-01T12:04:59.999Z");
  expect(await service.readAppSessionHandOver(OWNER, handOver!.requestId)).toEqual(handOver);
  now = new Date("2026-01-01T12:05:00Z");
  expect(await service.readAppSessionHandOver(OWNER, handOver!.requestId)).toBeNull();
});

test("keeps the session sealed in the hand-over", async ({ orm, seed, fakeConnectors }) => {
  const { service } = await readyIntegrationUser(orm, seed, fakeConnectors);
  await inviteIntegrationUserToFakeSlack(fakeConnectors, "admin");

  const result = await service.connectWithIntegrationUser(OWNER, SLACK);

  expect(result.handOver?.appSession).toEqual(expect.any(String));
  const shown = inspect(result, { depth: null, maxStringLength: null });
  expect(shown).not.toContain(INTEGRATION_USER_PASSWORD);
  expect(shown).not.toContain(INTEGRATION_USER_TOTP_SECRET);
  expect(shown).not.toContain("xoxc-");
});

test("keeps the integration user's secrets out of the answer and history", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const { service } = await readyIntegrationUser(orm, seed, fakeConnectors);
  await inviteIntegrationUserToFakeSlack(fakeConnectors, "admin");

  const result = await connectAsIntegrationUser(service);

  const shown = inspect([result, await storedRecordHistory(orm)], { depth: null });
  expect(shown).not.toContain(INTEGRATION_USER_PASSWORD);
  expect(shown).not.toContain(INTEGRATION_USER_TOTP_SECRET);
  expect(shown).not.toContain("xoxc-");
});

test("refuses to connect before the integration user signs in with two steps", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const owner = OWNER.user!;
  await seed.user({ id: owner.userId, email: owner.email });
  const { service } = containerConnections(orm, fakeConnectors.url);

  await expect(service.connectWithIntegrationUser(OWNER, SLACK)).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "integrationUser", code: "not_set_up" }],
  });
});

test("refuses a connector that cannot sign in as the integration user", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const { service } = await readyIntegrationUser(orm, seed, fakeConnectors);

  await expect(
    service.connectWithIntegrationUser(OWNER, { connector: "linear", noticeAccepted: true }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});

test("refuses the first connection without the notice accepted", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const { service } = await readyIntegrationUser(orm, seed, fakeConnectors);
  await inviteIntegrationUserToFakeSlack(fakeConnectors, "admin");

  await expect(
    service.connectWithIntegrationUser(OWNER, { connector: "slack" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "noticeAccepted", code: "required" }],
  });
  expect(await storedAppConnections(orm)).toEqual([]);
});

test("switches an own-session connection to the integration user's session and keeps its accounts", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const { service, scans, sent, connectionId, appSession } = await slackOnOwnSession(
    orm,
    seed,
    fakeConnectors,
  );
  const accounts = await storedAppAccounts(orm);
  await inviteIntegrationUserToFakeSlack(fakeConnectors, "admin");

  const result = await service.connectWithIntegrationUser(OWNER, { connector: "slack" });

  expect(result.handOver).toBeNull();
  expect(result.connection).toMatchObject({ id: connectionId, sessionFrom: "server_sign_in" });
  const [connection] = await storedAppConnections(orm);
  expect(connection).toMatchObject({ id: connectionId, sessionFrom: "server_sign_in" });
  const secrets = TEST_SECRET_BOX.decrypt(connection!.encryptedSecrets, connectionId);
  expect(secrets).not.toContain(appSession.cookies[0]!.value);
  expect(await storedAppAccounts(orm)).toEqual(accounts);
  const [source] = await storedImportSources(orm);
  expect(sent.at(-1)).toEqual({
    name: "imports.scanConnection",
    payload: { sourceId: source!.id },
  });
  await scans.runScan(SYSTEM, source!.id);
  expect(await storedAppAccounts(orm)).toHaveLength(accounts.length + 1);
});

test("refuses to switch to a session that opens another workspace, keeping the old one", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const { connectionId } = await slackOnOwnSession(orm, seed, fakeConnectors);
  const before = await storedAppConnections(orm);
  const container = express();
  container.post("/v1/connections/sign-in", (_request, response) => {
    response.json({
      details: { organizationName: "Other", domain: "other.slack.com" },
      connection: {
        settings: { teamId: "T09OTHER", teamDomain: "other", teamName: "Other" },
        secrets: { appSession: { cookies: [OTHER_WORKSPACE_COOKIE], storage: {} } },
      },
    });
  });
  const server = await serveConnectorRoutes(fakeConnectors.url, container);
  const { service } = containerConnections(orm, server.url);

  await expect(
    service.connectWithIntegrationUser(OWNER, { connector: "slack" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "integrationUser", code: "wrong_workspace" }],
  });
  expect(await storedAppConnections(orm)).toEqual(before);
  expect(before).toMatchObject([{ id: connectionId, sessionFrom: "extension" }]);
});

test("refuses to switch the owner's session while the connection's scan is running", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const { scans, connectionId } = await slackOnOwnSession(orm, seed, fakeConnectors);
  await inviteIntegrationUserToFakeSlack(fakeConnectors, "admin");
  await scans.scanNow(OWNER, connectionId);
  const before = await storedAppConnections(orm);
  let signIns = 0;
  const container = express();
  container.post("/v1/connections/sign-in", (_request, _response, next) => {
    signIns += 1;
    next();
  });
  const server = await serveConnectorRoutes(fakeConnectors.url, container);
  const { service } = containerConnections(orm, server.url);

  await expect(
    service.connectWithIntegrationUser(OWNER, { connector: "slack" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "integrationUser", code: "scan_running" }],
  });
  expect(await storedAppConnections(orm)).toEqual(before);
  expect(before).toMatchObject([{ id: connectionId, sessionFrom: "extension" }]);
  expect(signIns).toBe(0);
});

const OTHER_WORKSPACE_COOKIE = {
  name: "d",
  value: "other-workspace",
  domain: "slack.localhost",
  path: "/",
  httpOnly: true,
  secure: false,
  sameSite: "Lax",
};

/** Slack connected with the owner's handed-over session and scanned, with a ready integration user. */
async function slackOnOwnSession(
  orm: Parameters<typeof ownerHandOver>[0],
  seed: Parameters<typeof readyIntegrationUser>[1],
  fake: Parameters<typeof ownerHandOver>[1],
) {
  await readyIntegrationUser(orm, seed, fake);
  const services = await ownerHandOver(orm, fake);
  const saved = await services.service.connect(OWNER, {
    ...SLACK,
    appSession: services.handOver.appSession,
  });
  const [source] = await storedImportSources(orm);
  await services.scans.runScan(SYSTEM, source!.id);
  return { ...services, connectionId: saved.connection!.id };
}
