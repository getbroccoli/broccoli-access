import { inspect } from "node:util";

import type { ConnectorManifest } from "@broccoli-access/connector-contract";
import { ACME_LINEAR } from "@broccoli-access/fake-apps";

import express from "express";
import { onTestFinished } from "vitest";

import {
  expect,
  test,
  OWNER,
  EMPLOYEE,
  LINEAR_INPUT,
  containerConnections,
  startSimpleHttpServer,
  holdBeforeCommit,
  expectBlockedBy,
  failLinearCall,
  googleScanWithLinearGrant,
  storedApps,
  storedAppConnections,
  storedImportSources,
  storedRecordHistory,
  TEST_SECRET_BOX,
} from "#test/support";

import type { Orm } from "../../../core/db";

test("connects the approved catalog app, protects its key and queues its first scan", async ({
  orm,
  fakeConnectors,
}) => {
  const { service, sent } = containerConnections(orm, fakeConnectors.url);

  const saved = await service.connect(OWNER, {
    connector: "linear",
    values: [{ key: "apiKey", value: `  ${ACME_LINEAR.apiKey}  ` }],
  });

  expect(saved).toMatchObject({
    connector: { key: "linear" },
    connection: { adminUrl: "https://linear.app/acme/settings/members" },
  });
  const connectionId = saved.connection!.id;
  const state = await storedConnectionState(orm);
  expect(state.apps).toMatchObject([
    { name: "Linear", catalogKey: "linear", domain: "linear.app", status: "approved" },
  ]);
  const appId = state.apps[0]!.id;
  expect(state.connections).toMatchObject([
    { id: connectionId, appId, connector: "linear", status: "connected" },
  ]);
  const { encryptedSecrets, settings } = state.connections[0]!;
  expect(settings).toEqual(ACME_LINEAR.settings);
  expect(encryptedSecrets).not.toContain(ACME_LINEAR.apiKey);
  expect(JSON.parse(TEST_SECRET_BOX.decrypt(encryptedSecrets, connectionId))).toEqual({
    apiKey: ACME_LINEAR.apiKey,
  });
  expect(state.sources).toMatchObject([{ connectionId, name: "Acme", status: "scanning" }]);
  expect(sent).toEqual([
    { name: "imports.scanConnection", payload: { sourceId: state.sources[0]!.id } },
  ]);
  expect(state.history).toHaveLength(2);
  for (const [recordType, recordId] of [
    ["app", appId],
    ["app_connection", connectionId],
  ]) {
    expect(state.history.find((line) => line.recordType === recordType)).toMatchObject({
      recordId,
      operation: "created",
      authorKind: "signed_in_user",
      authorId: OWNER.user!.userId,
      causeKind: "edited_directly",
    });
  }
  expect(inspect(state.history, { depth: null })).not.toContain(ACME_LINEAR.apiKey);
});

test("Linear leaves the notice empty", async ({ orm, fakeConnectors }) => {
  const { service } = containerConnections(orm, fakeConnectors.url);
  const { connection } = await service.connect(OWNER, LINEAR_INPUT);

  expect(connection!.noticeAcceptedAt).toBeNull();
  expect(await storedAppConnections(orm)).toMatchObject([
    { noticeAcceptedAt: null, noticeAcceptedBy: null },
  ]);
});

test("approves the same Linear app Google discovered", async ({
  orm,
  fakeGoogle,
  fakeConnectors,
}) => {
  await googleScanWithLinearGrant(orm, fakeGoogle.url, "ana@acme.example");
  const discovered = (await storedApps(orm)).find((app) => app.name === "Linear")!;
  expect(discovered.status).toBe("discovered");

  await containerConnections(orm, fakeConnectors.url).service.connect(OWNER, LINEAR_INPUT);

  expect((await storedApps(orm)).filter((app) => app.name === "Linear")).toMatchObject([
    { id: discovered.id, status: "approved" },
  ]);
  expect(
    (await storedAppConnections(orm)).find((connection) => connection.connector === "linear")
      ?.appId,
  ).toBe(discovered.id);
  expect(
    (await storedRecordHistory(orm)).filter(
      (line) => line.recordId === discovered.id && line.operation === "updated",
    ),
  ).toMatchObject([
    {
      causeKind: "edited_directly",
      changes: [{ field: "status", oldValue: "discovered", newValue: "approved" }],
    },
  ]);
});

test("refuses a second connection and preserves the first one", async ({ orm, fakeConnectors }) => {
  const { service, sent } = containerConnections(orm, fakeConnectors.url);
  await service.connect(OWNER, LINEAR_INPUT);
  const before = await storedConnectionState(orm);
  const jobs = [...sent];

  await expect(service.connect(OWNER, LINEAR_INPUT)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "This app is already connected.",
  });

  expect(await storedConnectionState(orm)).toEqual(before);
  expect(sent).toEqual(jobs);
});

test.for([
  {
    reason: "a refused key",
    values: [{ key: "apiKey", value: "refused" }],
    field: "values",
    code: "authentication_failed",
  },
  {
    reason: "a blank key",
    values: [{ key: "apiKey", value: "  " }],
    field: "values.apiKey",
    code: "required",
  },
  {
    reason: "a repeated key",
    values: [...LINEAR_INPUT.values, ...LINEAR_INPUT.values],
    field: "values.apiKey",
    code: "duplicate",
  },
  { reason: "a missing key", values: [], field: "values.apiKey", code: "required" },
  {
    reason: "an unrequested field",
    values: [...LINEAR_INPUT.values, { key: "extra", value: "x" }],
    field: "values.extra",
    code: "unknown",
  },
])(
  "reports $reason as invalid input and saves nothing",
  async ({ values, field, code }, { orm, fakeConnectors }) => {
    const { service, sent } = containerConnections(orm, fakeConnectors.url);

    await expect(service.connect(OWNER, { connector: "linear", values })).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field, code }],
    });

    expect(await storedConnectionState(orm)).toEqual(EMPTY);
    expect(sent).toEqual([]);
  },
);

test("refuses typed values for an unknown connector and saves nothing", async ({
  orm,
  fakeConnectors,
}) => {
  const { service, sent } = containerConnections(orm, fakeConnectors.url);

  await expect(
    service.connect(OWNER, { ...LINEAR_INPUT, connector: "absent" }),
  ).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "The connectors container has no connector with this key.",
  });

  expect(await storedConnectionState(orm)).toEqual(EMPTY);
  expect(sent).toEqual([]);
});

test.for([
  {
    reason: "accepting the notice",
    input: { values: LINEAR_INPUT.values },
    field: "noticeAccepted",
  },
  { reason: "an app session", input: { noticeAccepted: true }, field: "appSession" },
])(
  "refuses to connect Slack without $reason and saves nothing",
  async ({ input, field }, { orm, fakeConnectors }) => {
    const { service, sent } = containerConnections(orm, fakeConnectors.url);

    await expect(service.connect(OWNER, { connector: "slack", ...input })).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field, code: "required" }],
    });
    expect(await storedConnectionState(orm)).toEqual(EMPTY);
    expect(sent).toEqual([]);
  },
);

test.for(["permission_missing", "wrong_workspace"] as const)(
  "reports %s on the values and saves nothing",
  async (code, { orm, fakeConnectors }) => {
    const { service, sent } = containerConnections(orm, fakeConnectors.url);
    await failLinearCall(fakeConnectors.url, "connections/test", code);

    await expect(service.connect(OWNER, LINEAR_INPUT)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "values", code }],
    });

    expect(await storedConnectionState(orm)).toEqual(EMPTY);
    expect(sent).toEqual([]);
  },
);

test("an unavailable app leaves no connection or queued scan", async ({ orm, fakeConnectors }) => {
  const { service, sent } = containerConnections(orm, fakeConnectors.url);
  await failLinearCall(fakeConnectors.url, "connections/test", "app_unavailable", 3);

  await expect(service.connect(OWNER, LINEAR_INPUT)).rejects.toMatchObject({
    code: "UNAVAILABLE",
    message: "The app did not answer the connection test.",
  });

  expect(await storedConnectionState(orm)).toEqual(EMPTY);
  expect(sent).toEqual([]);
});

test("refuses an employee and saves nothing", async ({ orm, fakeConnectors }) => {
  const { service, sent } = containerConnections(orm, fakeConnectors.url);

  await expect(service.connect(EMPLOYEE, LINEAR_INPUT)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });

  expect(await storedConnectionState(orm)).toEqual(EMPTY);
  expect(sent).toEqual([]);
});

test.for([
  { code: "rate_limited", count: 2 },
  { code: "app_unavailable", count: 1 },
] as const)(
  "connects after $count transient $code responses from the connection test",
  async ({ code, count }, { orm, fakeConnectors }) => {
    const { service, sent } = containerConnections(orm, fakeConnectors.url);
    await failLinearCall(fakeConnectors.url, "connections/test", code, count);

    await service.connect(OWNER, LINEAR_INPUT);

    expect(await storedAppConnections(orm)).toMatchObject([
      { connector: "linear", status: "connected" },
    ]);
    expect(sent).toHaveLength(1);
  },
);

test("two connector keys for the same app can save only one connection", async ({
  orm,
  fakeConnectors,
}) => {
  const response = await fetch(`${fakeConnectors.url}/v1/connectors`);
  const manifest = (await response.json()) as ConnectorManifest;
  const linear = manifest.connectors.find((connector) => connector.key === "linear")!;
  const app = express();
  app.get("/v1/connectors", (_request, response) => {
    response.json({ connectors: [linear, { ...linear, key: "linear-alternate" }] });
  });
  app.post("/v1/connections/test", (_request, response) => {
    response.json({
      details: { organizationName: "Acme", domain: null },
      connection: { settings: ACME_LINEAR.settings },
    });
  });
  const server = await startSimpleHttpServer(app);
  onTestFinished(() => server.stop());
  const { service, sent } = containerConnections(orm, server.url);
  await service.connect(OWNER, LINEAR_INPUT);
  const before = await storedConnectionState(orm);
  const jobs = [...sent];

  await expect(
    service.connect(OWNER, { ...LINEAR_INPUT, connector: "linear-alternate" }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "This app is already connected.",
  });

  expect(await storedConnectionState(orm)).toEqual(before);
  expect(sent).toEqual(jobs);
});

test("concurrent requests to connect Linear save one connection and one scan job", async ({
  orm,
  fakeConnectors,
  transact,
}) => {
  const held = holdBeforeCommit(transact);
  const { service, sent } = containerConnections(orm, fakeConnectors.url, held.transact);
  const first = service.connect(OWNER, LINEAR_INPUT);
  const pid = await held.ready;
  const results = Promise.allSettled([first, service.connect(OWNER, LINEAR_INPUT)]);
  try {
    await expectBlockedBy(orm, pid);
  } finally {
    held.release();
  }

  expect(await results).toMatchObject([
    { status: "fulfilled" },
    { status: "rejected", reason: { code: "CONFLICT", message: "This app is already connected." } },
  ]);
  expect(await storedAppConnections(orm)).toHaveLength(1);
  expect(await storedApps(orm)).toHaveLength(1);
  expect(sent).toHaveLength(1);
});

const EMPTY = { connections: [], apps: [], sources: [], history: [] };

async function storedConnectionState(orm: Orm) {
  return {
    connections: await storedAppConnections(orm),
    apps: await storedApps(orm),
    sources: await storedImportSources(orm),
    history: await storedRecordHistory(orm),
  };
}
