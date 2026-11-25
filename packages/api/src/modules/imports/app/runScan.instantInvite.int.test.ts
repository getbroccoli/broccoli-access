import { ACCOUNTS_LIST_ANSWER, ACCOUNTS_LIST_REQUEST } from "@broccoli-access/connector-contract";
import { callConnector, NOTION_CONNECTION } from "@broccoli-access/fake-apps/test/support";
import { vi } from "vitest";

import {
  accountChanges,
  appUsers,
  containerConnectors,
  expect,
  holdBeforeCommit,
  instantNotionInvite,
  scans,
  serveAccountList,
  SYSTEM,
  test,
} from "#test/support";

test("refreshes a stale roster when an instant invite and Remove leave the member count unchanged", async ({
  orm,
  transact,
  fakeGoogle,
}) => {
  const {
    owner,
    input,
    ivan,
    changes,
    appId,
    connectionId,
    sourceId,
    url,
    scans: originalScan,
  } = await instantNotionInvite(orm, fakeGoogle.url);
  const roster = await readNotionRoster(url);
  const users = appUsers(orm);
  const chloe = (await users.readUsersOfApps(owner, [appId])).find(
    ({ email }) => email === "chloe@acme.example",
  )!;
  const { latestInvite } = await changes.inviteEmployee(owner, input);
  const remove = await changes.changeAccount(owner, { appAccountId: chloe.id, action: "remove" });
  await originalScan.scanNow(owner, connectionId);

  const held = holdBeforeCommit(transact);
  const writer = accountChanges(orm, { connectorsUrl: url, transact: held.transact });
  const inviteFinish = Date.now();
  vi.setSystemTime(inviteFinish);
  const committing = writer.runChange(SYSTEM, latestInvite!.id);
  let rosterReads = 0;
  try {
    await Promise.race([
      held.ready,
      committing.then(() => {
        throw new Error("Invite finished without holding its transaction");
      }),
    ]);
    // Keep the invite's finish earlier than the scan's read without a timing sleep.
    vi.setSystemTime(inviteFinish + 1);
    const proxy = await serveAccountList(url, async (_request, response, next) => {
      if (++rosterReads > 1) return next();
      held.release();
      await committing;
      await changes.runChange(SYSTEM, remove.id);
      response.json(roster);
    });
    await scans(orm, { connectors: containerConnectors(proxy.url) }).runScan(SYSTEM, sourceId);
  } finally {
    held.release();
    vi.useRealTimers();
    await committing;
  }

  expect(await originalScan.readScan(owner, connectionId)).toMatchObject({ status: "scanned" });
  expect(await changes.readAccountChange(owner, remove.id)).toMatchObject({ status: "succeeded" });
  expect.soft(rosterReads).toBe(2);
  expect(await users.readUsersOfEmployees(owner, [ivan.id, chloe.employeeId])).toMatchObject([
    { ...input, email: ivan.email, status: "active", inApp: true },
  ]);
});

test("restarts an offset scan when an instant invite makes two pages overlap", async ({
  orm,
  fakeGoogle,
}) => {
  const { owner, input, ivan, changes, connectionId, sourceId, url } = await instantNotionInvite(
    orm,
    fakeGoogle.url,
  );
  const { latestInvite } = await changes.inviteEmployee(owner, input);
  const cursors: (string | null)[] = [];
  const proxy = await serveAccountList(url, async (request, response) => {
    const { cursor } = ACCOUNTS_LIST_REQUEST.parse(request.body);
    const { accounts } = await readNotionRoster(url);
    cursors.push(cursor);
    // In newest-first order the new member shifts the last row of page one onto page two.
    if (cursors.length === 1) await changes.runChange(SYSTEM, latestInvite!.id);
    const offset = Number(cursor ?? 0);
    const nextOffset = offset + 2;
    response.json({
      accounts: accounts.toReversed().slice(offset, nextOffset),
      nextCursor: nextOffset < accounts.length ? String(nextOffset) : null,
    });
  });
  const scan = scans(orm, { connectors: containerConnectors(proxy.url) });
  await scan.scanNow(owner, connectionId);

  await scan.runScan(SYSTEM, sourceId);

  expect(await changes.readAccountChange(owner, latestInvite!.id)).toMatchObject({
    status: "succeeded",
  });
  expect
    .soft(await scan.readScan(owner, connectionId))
    .toMatchObject({ status: "scanned", failure: null });
  expect.soft(cursors).toEqual([null, "2", null, "2"]);
  expect(await appUsers(orm).readUsersOfEmployees(owner, [ivan.id])).toMatchObject([
    { ...input, email: ivan.email, status: "active", inApp: true },
  ]);
});

test("rejects overlapping offset pages when the roster stays the same", async ({
  orm,
  fakeGoogle,
}) => {
  const { owner, connectionId, sourceId, url } = await instantNotionInvite(orm, fakeGoogle.url);
  const { accounts } = await readNotionRoster(url);
  const proxy = await serveAccountList(url, (request, response) => {
    const { cursor } = ACCOUNTS_LIST_REQUEST.parse(request.body);
    if (cursor === null) response.json({ accounts: accounts.slice(0, 2), nextCursor: "2" });
    else response.json({ accounts: accounts.slice(1), nextCursor: null });
  });
  const scan = scans(orm, { connectors: containerConnectors(proxy.url) });
  await scan.scanNow(owner, connectionId);

  await scan.runScan(SYSTEM, sourceId);

  expect(await scan.readScan(owner, connectionId)).toMatchObject({
    status: "scan_failed",
    failure: "unexpected_response",
  });
});

async function readNotionRoster(url: string) {
  const { body } = await callConnector(url, "accounts/list", {
    connector: "notion",
    connection: NOTION_CONNECTION,
    runtime: { kind: "server" },
    cursor: null,
  });
  return ACCOUNTS_LIST_ANSWER.parse(body);
}
