import express from "express";

import {
  accountChanges,
  appUsers,
  serveConnectorRoutes,
  postFakeControl,
  expect,
  failLinearCall,
  googleScanWithLinearGrant,
  linearMemberStatus,
  scannedLinear,
  scannedNotion,
  storedAppAccounts,
  storedImportRecords,
  storedRecordHistory,
  SYSTEM,
  test,
} from "#test/support";

import type { Orm } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";

test("runs a queued Remove on an active member when Notion cannot disable accounts", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner();
  const { changes, chloe } = await scannedNotion(orm, ["invite", "remove"]);
  const change = await changes.changeAccount(owner, { appAccountId: chloe.id, action: "remove" });

  await changes.runChange(SYSTEM, change.id);

  expect(await changes.readAccountChange(owner, change.id)).toMatchObject({
    status: "succeeded",
    appAccountId: null,
  });
  expect(await storedAppAccounts(orm)).not.toContainEqual(
    expect.objectContaining({ id: chloe.id }),
  );
});

test("a successful Remove clears an account without a person and a later scan leaves it gone", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const owner = await seed.owner();
  const { linear, account, service, change } = await requestRemoval(orm, fakeConnectors.url, owner);
  expect(account.employeeId).toBeNull();
  const before = await accountHistory(orm, account.id);

  await service.runChange(SYSTEM, change.id);

  const fake = await fetch(`${fakeConnectors.url}/_fake/state`);
  const state = (await fake.json()) as { linear: { email: string }[] };
  expect(state.linear.map((member) => member.email)).not.toContain(account.email);
  expect(await storedAppAccounts(orm)).not.toContainEqual(
    expect.objectContaining({ id: account.id }),
  );
  expect(await accountHistory(orm, account.id)).toMatchObject([
    ...before,
    {
      operation: "deleted",
      causeKind: "removed_in_app",
      causeRef: change.id,
      authorId: owner.user!.userId,
    },
  ]);
  expect((await service.listAccountChanges(owner, {})).edges).toMatchObject([
    {
      node: {
        id: change.id,
        action: "remove",
        status: "succeeded",
        appAccountId: null,
        email: account.email,
        appId: linear.appId,
      },
    },
  ]);
  expect(await service.readAccountChange(owner, change.id)).toMatchObject({
    status: "succeeded",
    appAccountId: null,
    email: account.email,
  });
  await linear.scans.scanNow(owner, linear.connectionId);
  await linear.scans.runScan(SYSTEM, linear.sourceId);
  expect(await linear.scans.readScan(owner, linear.connectionId)).toMatchObject({
    status: "scanned",
  });
  expect(await storedAppAccounts(orm)).not.toContainEqual(
    expect.objectContaining({ appId: linear.appId, email: account.email }),
  );
});

test("a refused Remove keeps the member until the owner confirms removal by hand", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const owner = await seed.owner();
  const { account, service, change } = await requestRemoval(orm, fakeConnectors.url, owner);
  const before = await accountHistory(orm, account.id);
  const records = await storedImportRecords(orm);
  await failLinearCall(fakeConnectors.url, "actions/run", "not_allowed");

  await service.runChange(SYSTEM, change.id);

  expect((await service.readChangeStates(owner, [account.id])).get(account.id)).toMatchObject({
    offeredChange: "reactivate",
    latestChange: { id: change.id, status: "failed", error: "not_allowed" },
  });
  expect(await linearMemberStatus(fakeConnectors.url, account.email)).toBe("suspended");
  expect(await storedImportRecords(orm)).toEqual(records);
  expect(await accountHistory(orm, account.id)).toEqual(before);
  const removed = await fetch(
    `${fakeConnectors.url}/_fake/linear/members/${account.email}/remove`,
    { method: "POST" },
  );
  expect(removed.status).toBe(204);

  await service.markChangeDoneByHand(owner, change.id);

  expect(await storedAppAccounts(orm)).not.toContainEqual(
    expect.objectContaining({ id: account.id }),
  );
  expect(await accountHistory(orm, account.id)).toMatchObject([
    ...before,
    {
      operation: "deleted",
      causeKind: "done_by_hand",
      causeRef: change.id,
      authorId: owner.user!.userId,
    },
  ]);
  expect((await service.listAccountChanges(owner, {})).edges).toMatchObject([
    {
      node: {
        id: change.id,
        action: "remove",
        status: "done_by_hand",
        error: "not_allowed",
        appAccountId: null,
        email: account.email,
      },
    },
  ]);
  expect(await storedImportRecords(orm)).toEqual(
    records.filter((record) => record.sourceKey !== change.sourceKey),
  );
});

test("removing a member also found by Google keeps the linked account as not in Linear", async ({
  orm,
  fakeGoogle,
  fakeConnectors,
}) => {
  const email = "hannah@acme.example";
  const { owner } = await googleScanWithLinearGrant(orm, fakeGoogle.url, email);
  const { linear, account, service, change } = await requestRemoval(orm, fakeConnectors.url, owner);
  const records = await storedImportRecords(orm);

  await service.runChange(SYSTEM, change.id);

  expect(await storedImportRecords(orm)).toEqual(
    records.filter(
      (record) => record.sourceId !== linear.sourceId || record.sourceKey !== change.sourceKey,
    ),
  );
  const users = await appUsers(orm).readUsersOfApps(owner, [linear.appId]);
  expect(users.find((user) => user.id === account.id)).toMatchObject({
    email,
    employeeId: account.employeeId,
    inApp: false,
    foundVia: ["google_sign_in"],
  });
  const states = await service.readChangeStates(owner, [account.id]);
  expect(states.get(account.id)).toMatchObject({
    offersRemove: false,
    latestChange: { id: change.id, status: "succeeded" },
  });
});

test("does not dispatch a queued Remove after a scan sees the member active again", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const owner = await seed.owner();
  const { linear, account, change } = await requestRemoval(orm, fakeConnectors.url, owner);
  await postFakeControl(fakeConnectors.url, `linear/members/${account.email}/reactivate`);
  await linear.scans.scanNow(owner, linear.connectionId);
  await linear.scans.runScan(SYSTEM, linear.sourceId);
  let calls = 0;
  const proxy = express();
  proxy.post("/v1/actions/run", (_request, _response, next) => {
    calls++;
    next();
  });
  const server = await serveConnectorRoutes(fakeConnectors.url, proxy);
  const runner = accountChanges(orm, { connectorsUrl: server.url });

  await runner.runChange(SYSTEM, change.id);

  expect(calls).toBe(0);
  expect((await runner.listAccountChanges(owner, {})).edges).toMatchObject([
    { node: { id: change.id, status: "failed" } },
  ]);
  expect(await linearMemberStatus(fakeConnectors.url, account.email)).toBe("active");
});

test("a verified Remove succeeds when a scan turns the connection to Reconnect before its answer arrives", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const owner = await seed.owner();
  const { linear, account, change, service } = await requestRemoval(orm, fakeConnectors.url, owner);
  const queued = await service.changeAccount(owner, {
    appAccountId: linear.account("chloe@acme.example").id,
    action: "suspend",
  });
  const proxy = express();
  proxy.post("/v1/actions/run", express.json(), async (request, response) => {
    const upstream = await fetch(`${fakeConnectors.url}/v1/actions/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request.body),
    });
    const verified: unknown = await upstream.json();
    await failLinearCall(fakeConnectors.url, "accounts/list", "permission_missing");
    await linear.scans.scanNow(owner, linear.connectionId);
    await linear.scans.runScan(SYSTEM, linear.sourceId);
    response.json(verified);
  });
  const server = await serveConnectorRoutes(fakeConnectors.url, proxy);

  await accountChanges(orm, { connectorsUrl: server.url }).runChange(SYSTEM, change.id);

  const activity = await service.listAccountChanges(owner, {});
  expect(activity.edges.map(({ node }) => node)).toMatchObject([
    { id: queued.id, status: "failed", error: "permission_missing" },
    { id: change.id, status: "succeeded", error: null },
  ]);
  expect(await storedAppAccounts(orm)).not.toContainEqual(
    expect.objectContaining({ id: account.id }),
  );
});

test("Remove is offered and runs right after a Disable made here, before any scan", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const owner = await seed.owner();
  const linear = await scannedLinear(orm, fakeConnectors.url);
  const account = linear.account("chloe@acme.example");
  const service = accountChanges(orm, { connectorsUrl: fakeConnectors.url });
  const disable = await service.changeAccount(owner, {
    appAccountId: account.id,
    action: "suspend",
  });
  await service.runChange(SYSTEM, disable.id);

  const states = await service.readChangeStates(owner, [account.id]);
  const remove = await service.changeAccount(owner, { appAccountId: account.id, action: "remove" });
  await service.runChange(SYSTEM, remove.id);

  expect(states.get(account.id)).toMatchObject({ offersRemove: true });
  expect(await service.readAccountChange(owner, remove.id)).toMatchObject({
    status: "succeeded",
  });
  const fake = await fetch(`${fakeConnectors.url}/_fake/state`);
  const state = (await fake.json()) as { linear: { email: string }[] };
  expect(state.linear.map((member) => member.email)).not.toContain(account.email);
});

test("a Disable marked done by hand offers no Remove until a scan sees the member disabled", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const owner = await seed.owner();
  const linear = await scannedLinear(orm, fakeConnectors.url);
  const account = linear.account("chloe@acme.example");
  const service = accountChanges(orm, { connectorsUrl: fakeConnectors.url });
  const disable = await service.changeAccount(owner, {
    appAccountId: account.id,
    action: "suspend",
  });
  await failLinearCall(fakeConnectors.url, "actions/run", "not_allowed");
  await service.runChange(SYSTEM, disable.id);

  await service.markChangeDoneByHand(owner, disable.id);

  const states = await service.readChangeStates(owner, [account.id]);
  expect(states.get(account.id)).toMatchObject({ offersRemove: false });
});

async function requestRemoval(orm: Orm, url: string, owner: SecurityContext) {
  const linear = await scannedLinear(orm, url);
  const account = linear.account("hannah@acme.example");
  const service = accountChanges(orm, { connectorsUrl: url });
  const change = await service.changeAccount(owner, { appAccountId: account.id, action: "remove" });
  return { linear, account, service, change };
}

async function accountHistory(orm: Orm, id: string) {
  return (await storedRecordHistory(orm)).filter((line) => line.recordId === id);
}
