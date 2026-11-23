import assert from "node:assert/strict";

import type {
  ConnectorCall,
  ConnectorErrorCode,
  ConnectorManifest,
} from "@broccoli-access/connector-contract";
import { ACME_LINEAR, type RunningFakeConnectors } from "@broccoli-access/fake-apps";
import express, { type RequestHandler } from "express";
import { onTestFinished } from "vitest";

import type { Orm, Transact } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import { createAppConnectionService } from "../../src/modules/apps";
import {
  createContainerConnectionService,
  createContainerConnectors,
} from "../../src/modules/connectors";
import { recordingJobQueue } from "./recordingJobQueue";
import { signInToFakeSlack } from "./signInToFakeSlack";
import { startSimpleHttpServer } from "./simpleHttpServer";
import { scans } from "./services";
import { storedAppConnections } from "./storedGoogleConnection";
import { storedImportSources } from "./storedScan";
import { OWNER } from "./testSecurityContext";
import { TEST_SECRET_BOX } from "./testSecretBox";
import { testTransactor } from "./testTransactor";

export const LINEAR_INPUT = {
  connector: "linear",
  values: [{ key: "apiKey", value: ACME_LINEAR.apiKey }],
};

export function containerConnectors(url?: string) {
  return createContainerConnectors({ url, logger: createLogger("silent") });
}

/** Connects and scans through the container, recording the jobs for the test to run. */
export function containerConnections(
  orm: Orm,
  url: string,
  transact: Transact = testTransactor(orm),
  now?: () => Date,
) {
  const { jobs, sent } = recordingJobQueue();
  const connectors = containerConnectors(url);
  const scanService = scans(orm, { jobs, connectors });
  const service = createContainerConnectionService({
    orm,
    transact,
    secretBox: TEST_SECRET_BOX,
    now,
    wait: () => Promise.resolve(),
    logger: createLogger("silent"),
    containerConnectors: connectors,
    connectedApps: createAppConnectionService({ secretBox: TEST_SECRET_BOX }),
    scans: scanService,
  });
  return { service, scans: scanService, sent };
}

/** Leaves the first Linear scan queued and returns its stored app, connection and source. */
export async function connectLinear(orm: Orm, url: string) {
  const { service, scans } = containerConnections(orm, url);
  await service.connect(OWNER, LINEAR_INPUT);
  const connection = (await storedAppConnections(orm)).find((row) => row.connector === "linear")!;
  const source = (await storedImportSources(orm)).find(
    (row) => row.connectionId === connection.id,
  )!;
  return { connectionId: connection.id, appId: connection.appId, sourceId: source.id, scans };
}

export async function failLinearCall(
  url: string,
  call: ConnectorCall,
  code: ConnectorErrorCode,
  count = 1,
) {
  const response = await fetch(`${url}/_fake/failures`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ connector: "linear", call, code, count }),
  });
  assert.equal(response.status, 204);
}

/** Serves the fake connectors manifest with the test's changes. */
export async function serveManifest(
  fakeUrl: string,
  change: (manifest: ConnectorManifest) => void,
) {
  const response = await fetch(`${fakeUrl}/v1/connectors`);
  const manifest = (await response.json()) as ConnectorManifest;
  change(manifest);
  const app = express();
  app.get("/v1/connectors", (_request, response) => {
    response.json(manifest);
  });
  const server = await startSimpleHttpServer(app);
  onTestFinished(() => server.stop());
  return server;
}

/** Replaces the fake container's accounts/list answer. */
export function serveAccountList(fakeUrl: string, list: RequestHandler) {
  const app = express();
  app.post("/v1/accounts/list", express.json(), list);
  return serveConnectorRoutes(fakeUrl, app);
}

/** Forwards calls the test routes did not handle to the real fake container. */
export async function serveConnectorRoutes(fakeUrl: string, app: express.Express) {
  app.use(express.json(), async (request, response) => {
    const upstream = await fetch(`${fakeUrl}${request.path}`, {
      method: request.method,
      headers: { "content-type": "application/json" },
      body: request.method === "POST" ? JSON.stringify(request.body) : undefined,
    });
    response
      .status(upstream.status)
      .type("json")
      .send(await upstream.text());
  });
  const server = await startSimpleHttpServer(app);
  onTestFinished(() => server.stop());
  return server;
}

/** The owner's session issued by this test's fake, handed over to the real service. */
export async function ownerHandOver(orm: Orm, fake: RunningFakeConnectors, now?: () => Date) {
  const services = containerConnections(orm, fake.url, undefined, now);
  const appSession = await signInToFakeSlack(fake);
  const requestId = "owner-request";
  await services.service.handOverAppSession({
    requestId,
    userId: OWNER.user!.userId,
    connector: "slack",
    appSession,
  });
  const handOver = await services.service.readAppSessionHandOver(OWNER, requestId);
  assert.ok(handOver);
  return { ...services, handOver, requestId, appSession };
}
