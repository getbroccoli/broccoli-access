import { CONNECTOR_MANIFEST, type ActionRunAnswer } from "@broccoli-access/connector-contract";
import { ACME_LINEAR } from "@broccoli-access/fake-apps";
import express from "express";

import {
  accountChanges,
  expect,
  failLinearCall,
  linearMemberStatus,
  scannedLinear,
  serveConnectorRoutes,
  listedLinearChloe,
  storedAppAccounts,
  storedAppConnections,
  storedRecordHistory,
  SYSTEM,
  test as baseTest,
  type TestSeed,
} from "#test/support";

import type { Orm } from "../../../core/db";

const test = baseTest.extend<{ pending: Awaited<ReturnType<typeof pendingDisable>> }>({
  pending: async ({ orm, seed, fakeConnectors }, use) => {
    await use(await pendingDisable(orm, seed, fakeConnectors.url));
  },
});

test("disables Chloé in Linear and records her suspension under the owner's name", async ({
  orm,
  pending,
  fakeConnectors,
}) => {
  const { service, change, chloe, owner } = pending;

  await service.runChange(SYSTEM, change.id);

  expect(await linearMemberStatus(fakeConnectors.url, chloe.email)).toBe("suspended");
  expect(await savedStatus(orm, chloe.id)).toBe("suspended");
  expect(await pending.latest()).toMatchObject({
    id: change.id,
    status: "succeeded",
    error: null,
    attempts: [{ runtime: "server", error: null, at: expect.any(Date) as unknown }],
    finishedAt: expect.any(Date) as unknown,
  });
  expect(await updates(orm, chloe.id)).toMatchObject([
    {
      recordType: "app_account",
      causeKind: "changed_in_app",
      causeRef: change.id,
      authorKind: "signed_in_user",
      authorId: owner.user!.userId,
      changes: [{ field: "status", oldValue: "active", newValue: "suspended" }],
    },
  ]);
});

test("enables Chloé again in Linear and adds a separate account history line", async ({
  orm,
  pending,
  fakeConnectors,
}) => {
  const { service, change, owner, chloe } = pending;
  await service.runChange(SYSTEM, change.id);
  const enable = await service.changeAccount(owner, {
    appAccountId: chloe.id,
    action: "reactivate",
  });

  await service.runChange(SYSTEM, enable.id);

  expect(await linearMemberStatus(fakeConnectors.url, chloe.email)).toBe("active");
  expect(await savedStatus(orm, chloe.id)).toBe("active");
  expect(await pending.latest()).toMatchObject({ id: enable.id, status: "succeeded" });
  expect(await updates(orm, chloe.id)).toMatchObject([
    { causeRef: change.id },
    {
      recordType: "app_account",
      causeKind: "changed_in_app",
      causeRef: enable.id,
      authorKind: "signed_in_user",
      authorId: owner.user!.userId,
      changes: [{ field: "status", oldValue: "suspended", newValue: "active" }],
    },
  ]);
});

test.for(["app_unavailable", "rate_limited"] as const)(
  "succeeds on the third call after %s and records one server attempt",
  async (code, { pending, fakeConnectors }) => {
    await failLinearCall(fakeConnectors.url, "actions/run", code, 2);

    await pending.service.runChange(SYSTEM, pending.change.id);

    expect(await pending.latest()).toMatchObject({
      status: "succeeded",
      error: null,
      attempts: [{ runtime: "server", error: null, at: expect.any(Date) as unknown }],
    });
    expect(await linearMemberStatus(fakeConnectors.url, pending.chloe.email)).toBe("suspended");
  },
);

test.for([
  { code: "app_unavailable", count: 3 },
  { code: "not_allowed", count: 1 },
  { code: "account_not_found", count: 1 },
  { code: "permission_missing", count: 1 },
  { code: "wrong_workspace", count: 1 },
] as const)(
  "fails after $count $code answer(s) and leaves the account and its history alone",
  async ({ code, count }, { orm, pending, fakeConnectors }) => {
    const { service, change, chloe } = pending;
    await failLinearCall(fakeConnectors.url, "actions/run", code, count);
    const before = await storedRecordHistory(orm);

    await service.runChange(SYSTEM, change.id);

    expect(await pending.latest()).toMatchObject({
      status: "failed",
      error: code,
      finishedAt: expect.any(Date) as unknown,
      attempts: [{ runtime: "server", error: code, at: expect.any(Date) as unknown }],
    });
    expect(await linearMemberStatus(fakeConnectors.url, chloe.email)).toBe("active");
    expect(await savedStatus(orm, chloe.id)).toBe("active");
    expect((await storedRecordHistory(orm)).filter((line) => line.recordId === chloe.id)).toEqual(
      before.filter((line) => line.recordId === chloe.id),
    );
  },
);

test("saves renewed connection settings from the action answer", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const settings = { ...ACME_LINEAR.settings, urlKey: "renamed" };
  const url = await serveActionAnswer(fakeConnectors.url, {
    ...actionAnswer("suspended"),
    connection: { settings },
  });
  const pending = await pendingDisable(orm, seed, url);

  await pending.service.runChange(SYSTEM, pending.change.id);

  expect(await storedAppConnections(orm)).toMatchObject([
    { id: pending.change.connectionId, settings },
  ]);
  expect(await pending.latest()).toMatchObject({ status: "succeeded" });
});

test.for([
  { reason: "the old status", answer: actionAnswer("active") },
  { reason: "another source key", answer: actionAnswer("suspended", "another-member") },
])(
  "fails with unexpected_response when the connector returns $reason",
  async ({ answer }, { orm, seed, fakeConnectors }) => {
    const url = await serveActionAnswer(fakeConnectors.url, answer);
    const pending = await pendingDisable(orm, seed, url);

    await pending.service.runChange(SYSTEM, pending.change.id);

    expect(await pending.latest()).toMatchObject({
      status: "failed",
      error: "unexpected_response",
      attempts: [{ runtime: "server", error: "unexpected_response" }],
    });
    expect(await savedStatus(orm, pending.chloe.id)).toBe("active");
    expect(await updates(orm, pending.chloe.id)).toEqual([]);
  },
);

test("skips a finished change even if the member has since been enabled in Linear", async ({
  orm,
  pending,
  fakeConnectors,
}) => {
  const { service, change, chloe } = pending;
  await service.runChange(SYSTEM, change.id);
  const finished = await pending.latest();
  const history = await storedRecordHistory(orm);
  const response = await fetch(
    `${fakeConnectors.url}/_fake/linear/members/${chloe.email}/reactivate`,
    { method: "POST" },
  );
  expect(response.status).toBe(204);

  await service.runChange(SYSTEM, change.id);

  expect(await linearMemberStatus(fakeConnectors.url, chloe.email)).toBe("active");
  expect(await pending.latest()).toEqual(finished);
  expect(await storedRecordHistory(orm)).toEqual(history);
});

test("fails without an attempt when Linear stops offering Disable before the run", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const manifest = CONNECTOR_MANIFEST.parse(
    await (await fetch(`${fakeConnectors.url}/v1/connectors`)).json(),
  );
  const linear = manifest.connectors.find(({ key }) => key === "linear")!;
  let actionCalls = 0;
  const app = express();
  app.get("/v1/connectors", (_request, response) => response.json(manifest));
  app.post("/v1/actions/run", (_request, _response, next) => {
    actionCalls++;
    next();
  });
  const server = await serveConnectorRoutes(fakeConnectors.url, app);
  const pending = await pendingDisable(orm, seed, server.url);
  linear.capabilities = linear.capabilities.filter((capability) => capability !== "suspend");
  const runner = accountChanges(orm, { connectorsUrl: server.url });

  await runner.runChange(SYSTEM, pending.change.id);

  expect(actionCalls).toBe(0);
  expect(await pending.latest()).toMatchObject({
    status: "failed",
    error: "app_unavailable",
    attempts: [],
  });
});

test("fails a running change as unavailable when the job runs out of attempts", async ({
  pending,
}) => {
  await pending.service.failChange(SYSTEM, pending.change.id);

  expect(await pending.latest()).toMatchObject({
    status: "failed",
    error: "app_unavailable",
    attempts: [],
    finishedAt: expect.any(Date) as unknown,
  });
});

test.for(["runChange", "failChange"] as const)(
  "allows only the system to call %s",
  async (method, { pending }) => {
    await expect(pending.service[method](pending.owner, pending.change.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await pending.latest()).toMatchObject({
      status: "running",
      attempts: [],
      finishedAt: null,
    });
  },
);

async function pendingDisable(orm: Orm, seed: TestSeed, url: string) {
  const linear = await scannedLinear(orm, url);
  const chloe = linear.account("chloe@acme.example");
  const owner = await seed.owner();
  const service = accountChanges(orm, { connectorsUrl: url });
  const change = await service.changeAccount(owner, { appAccountId: chloe.id, action: "suspend" });
  const latest = async () =>
    (await service.readChangeStates(owner, [chloe.id])).get(chloe.id)?.latestChange;
  return { service, chloe, owner, change, latest };
}

async function savedStatus(orm: Orm, id: string) {
  return (await storedAppAccounts(orm)).find((account) => account.id === id)?.status;
}

async function updates(orm: Orm, id: string) {
  return (await storedRecordHistory(orm)).filter(
    (line) => line.recordId === id && line.operation === "updated",
  );
}

function actionAnswer(status: "active" | "suspended", otherSourceKey?: string): ActionRunAnswer {
  const { sourceKey, values } = listedLinearChloe(status);
  return { changed: true, account: { sourceKey: otherSourceKey ?? sourceKey, values } };
}

/** The fake handles connection and scan calls. Only the action answer is replaced. */
async function serveActionAnswer(fakeUrl: string, answer: ActionRunAnswer) {
  const app = express();
  app.post("/v1/actions/run", (_request, response) => {
    response.json(answer);
  });
  return (await serveConnectorRoutes(fakeUrl, app)).url;
}
