import type { ConnectorCall, ConnectorErrorCode } from "@broccoli-access/connector-contract";
import type { RunningFakeConnectors } from "@broccoli-access/fake-apps";
import express from "express";

import type { SecurityContext } from "../../src/core/security";
import type { Orm } from "../../src/core/db";
import { createAppConnectionService } from "../../src/modules/apps";
import { importSourceRepository } from "../../src/modules/imports/db";
import { storedIntegrationUsers } from "./storedGoogleConnection";
import { accountChanges } from "./accountChanges";
import { containerConnections, ownerHandOver, serveConnectorRoutes } from "./containerConnections";
import {
  connectAsIntegrationUser,
  INTEGRATION_USER_EMAIL,
  inviteIntegrationUserToFakeSlack,
  seedReadyIntegrationUser,
} from "./integrationUserConnect";
import { postFakeControl } from "./reconnect";
import { storedAppAccounts, storedImportSources } from "./storedScan";
import { TEST_SECRET_BOX } from "./testSecretBox";
import { OWNER, SYSTEM } from "./testSecurityContext";
import type { TestSeed } from "./testSeed";

/** Connects Slack and records container requests from the end of setup onwards. */
export async function slackSession(
  orm: Orm,
  seed: TestSeed,
  fake: RunningFakeConnectors,
  sessionFrom: "server_sign_in" | "extension" = "server_sign_in",
) {
  await seedReadyIntegrationUser(seed);
  return slackSessionForOwner(orm, fake, OWNER, sessionFrom);
}

export async function slackSessionForOwner(
  orm: Orm,
  fake: RunningFakeConnectors,
  owner: SecurityContext,
  sessionFrom: "server_sign_in" | "extension" = "server_sign_in",
) {
  const calls: string[] = [];
  const app = express();
  const routes: express.Router = express.Router();
  app.use((req, _res, next) => {
    calls.push(req.path);
    next();
  }, routes);
  const server = await serveConnectorRoutes(fake.url, app);
  const { service, scans, renewals } = containerConnections(orm, server.url);
  await inviteIntegrationUserToFakeSlack(fake, "admin");
  const connected =
    sessionFrom === "server_sign_in"
      ? await connectAsIntegrationUser(service, owner)
      : await connectOwnerSession();
  const { id: connectionId } = connected.connection!;
  const sourceId = (await storedImportSources(orm)).find(
    (row) => row.connectionId === connectionId,
  )!.id;
  const connections = createAppConnectionService({ secretBox: TEST_SECRET_BOX });
  const changes = accountChanges(orm, { connectorsUrl: server.url, renewals });
  const readConnection = () => connections.readConnectionById(orm, connectionId);
  calls.length = 0;
  return {
    calls,
    routes,
    scans,
    changes,
    renewals,
    readConnection,
    connectionId,
    sourceId,
    secrets: () => connections.readSecrets(orm, connectionId),
    expire: () => postFakeControl(fake.url, "slack/sessions/expire"),
    fail: (call: ConnectorCall | "connections/sign-in", code: ConnectorErrorCode, count = 1) =>
      postFakeControl(fake.url, "failures", { connector: "slack", call, code, count }),
    async queueDisable() {
      await scans.runScan(SYSTEM, sourceId);
      const { appId } = (await readConnection())!;
      const ana = (await storedAppAccounts(orm)).find(
        (account) => account.appId === appId && account.email === "ana@acme.example",
      )!;
      const change = await changes.changeAccount(owner, {
        appAccountId: ana.id,
        action: "suspend",
      });
      return {
        run: () => changes.runChange(SYSTEM, change.id),
        latest: async () =>
          (await changes.readChangeStates(owner, [ana.id])).get(ana.id)?.latestChange,
      };
    },
  };

  async function connectOwnerSession() {
    const handOver = await ownerHandOver(orm, fake, undefined, owner);
    return handOver.service.connect(owner, {
      connector: "slack",
      noticeAccepted: true,
      appSession: handOver.handOver.appSession,
    });
  }
}

export async function suspendIntegrationUserInDirectory(
  orm: Orm,
  seed: TestSeed,
  email = INTEGRATION_USER_EMAIL,
) {
  const directory = await seed.app({
    name: "Google Workspace",
    domain: "workspace.google.com",
    catalogKey: "google_workspace",
    status: "approved",
  });
  const connection = await seed.appConnection({
    appId: directory.id,
    connector: "google_workspace",
  });
  const sources = importSourceRepository(orm);
  const source = await sources.insertScanning({
    connectionId: connection.id,
    name: "acme.example",
  });
  const [user] = await storedIntegrationUsers(orm);
  await sources.replaceRecords(source.id, [
    {
      sourceKey: user!.googleUserId,
      raw: { id: user!.googleUserId, primaryEmail: email, suspended: true },
      values: {
        email,
        status: "suspended",
        appName: "Google Workspace",
        isConnectionUser: false,
        displayName: null,
        firstName: null,
        lastName: null,
        managerEmail: null,
        grantedAt: null,
        grantedBefore: null,
        appExternalId: null,
      },
    },
  ]);
  await sources.markScanned(source.id, new Date("2026-01-01T00:00:00Z"));
  await seed.appAccount({
    appId: directory.id,
    email,
    foundVia: ["google_directory"],
    kind: "service",
    status: "suspended",
  });
}
