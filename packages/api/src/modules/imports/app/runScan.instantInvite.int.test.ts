import { ACCOUNTS_LIST_ANSWER } from "@broccoli-access/connector-contract";
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

async function readNotionRoster(url: string) {
  const { body } = await callConnector(url, "accounts/list", {
    connector: "notion",
    connection: NOTION_CONNECTION,
    runtime: { kind: "server" },
    cursor: null,
  });
  return ACCOUNTS_LIST_ANSWER.parse(body);
}
