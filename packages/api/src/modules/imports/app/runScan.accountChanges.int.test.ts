import { ACME_LINEAR, type RunningFakeConnectors } from "@broccoli-access/fake-apps";

import type { Orm } from "../../../core/db";

import {
  accountChanges,
  appUsers,
  OWNER,
  ownerHandOver,
  postFakeControl,
  storedImportSources,
  containerConnectors,
  expect,
  instantNotionInvite,
  linearMemberStatus,
  storedImportRecords,
  listedLinearChloe,
  scanAfterFirstPage,
  scannedLinear,
  scans,
  serveAccountList,
  storedAppAccounts,
  storedRecordHistory,
  SYSTEM,
  test,
  type TestSeed,
} from "#test/support";

test("reads a fresh roster when Notion adds a member after the scan fetched its first page", async ({
  orm,
  fakeGoogle,
}) => {
  const { owner, ivan, input, changes, connectionId, sourceId, url } = await instantNotionInvite(
    orm,
    fakeGoogle.url,
  );
  const { latestInvite } = await changes.inviteEmployee(owner, input);
  let rosterReads = 0;
  const scan = await scanAfterFirstPage(
    orm,
    url,
    () => changes.runChange(SYSTEM, latestInvite!.id),
    () => rosterReads++,
  );
  await scan.scanNow(owner, connectionId);

  await scan.runScan(SYSTEM, sourceId);

  expect(await scan.readScan(owner, connectionId)).toMatchObject({ status: "scanned" });
  expect.soft(rosterReads).toBe(2);
  expect(await appUsers(orm).readUsersOfEmployees(owner, [ivan.id])).toMatchObject([
    { ...input, email: ivan.email, status: "active", inApp: true },
  ]);
});

test("keeps Chloé suspended when a scan saves the active status it read before Disable finished", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const owner = await seed.owner();
  const linear = await scannedLinear(orm, fakeConnectors.url);
  const member = listedLinearChloe("active");
  const chloe = linear.account(member.values.email);
  const changes = accountChanges(orm, { connectorsUrl: fakeConnectors.url });
  const change = await changes.changeAccount(owner, { appAccountId: chloe.id, action: "suspend" });
  const scan = await scanAfterFirstPage(orm, fakeConnectors.url, () =>
    changes.runChange(SYSTEM, change.id),
  );
  await scan.scanNow(owner, linear.connectionId);

  await scan.runScan(SYSTEM, linear.sourceId);

  expect(await linearMemberStatus(fakeConnectors.url, chloe.email)).toBe("suspended");
  expect(await scan.readScan(owner, linear.connectionId)).toMatchObject({ status: "scanned" });
  expect((await storedAppAccounts(orm)).find(({ id }) => id === chloe.id)?.status).toBe(
    "suspended",
  );
});

test("a scan that read a member before Remove cannot restore their import record or account", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const owner = await seed.owner();
  const member = listedLinearChloe("suspended");
  const { email } = member.values;
  const suspended = await fetch(`${fakeConnectors.url}/_fake/linear/members/${email}/suspend`, {
    method: "POST",
  });
  expect(suspended.status).toBe(204);
  const linear = await scannedLinear(orm, fakeConnectors.url);
  const changes = accountChanges(orm, { connectorsUrl: fakeConnectors.url });
  const change = await changes.changeAccount(owner, {
    appAccountId: linear.account(email).id,
    action: "remove",
  });
  const scan = await scanAfterFirstPage(orm, fakeConnectors.url, () =>
    changes.runChange(SYSTEM, change.id),
  );
  await scan.scanNow(owner, linear.connectionId);

  await scan.runScan(SYSTEM, linear.sourceId);

  expect(await scan.readScan(owner, linear.connectionId)).toMatchObject({ status: "scanned" });
  expect(await storedImportRecords(orm)).not.toContainEqual(
    expect.objectContaining({ sourceId: linear.sourceId, sourceKey: member.sourceKey }),
  );
  expect(await storedAppAccounts(orm)).not.toContainEqual(
    expect.objectContaining({ appId: linear.appId, email }),
  );
});

test("a restarted scan uses the connection settings renewed by the interrupted scan", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const owner = await seed.owner();
  const linear = await scannedLinear(orm, fakeConnectors.url);
  const changes = accountChanges(orm, { connectorsUrl: fakeConnectors.url });
  const change = await changes.changeAccount(owner, {
    appAccountId: linear.account("hannah@acme.example").id,
    action: "remove",
  });
  const member = listedLinearChloe("active");
  const settings = { ...ACME_LINEAR.settings, urlKey: "renamed" };
  let renewed = false;
  const workspace = await serveAccountList(fakeConnectors.url, async (request, response, next) => {
    if (!renewed) {
      renewed = true;
      await changes.runChange(SYSTEM, change.id);
      await postFakeControl(fakeConnectors.url, `linear/members/${member.values.email}/suspend`);
      response.json({ accounts: [member], nextCursor: null, connection: { settings } });
    } else if (
      (request.body as { connection: { settings: { urlKey: string } } }).connection.settings
        .urlKey !== settings.urlKey
    ) {
      response.json({ error: { code: "wrong_workspace" } });
    } else {
      next();
    }
  });
  const scan = scans(orm, { connectors: containerConnectors(workspace.url) });
  await scan.scanNow(owner, linear.connectionId);

  await scan.runScan(SYSTEM, linear.sourceId);

  expect(await scan.readScan(owner, linear.connectionId)).toMatchObject({ status: "scanned" });
  expect(
    (await storedAppAccounts(orm)).find((row) => row.email === member.values.email)?.status,
  ).toBe("suspended");
});

test.for(["before cleanup", "during cleanup"] as const)(
  "a renamed import with the original key survives when its scan saves %s",
  async (when, { orm, seed, fakeConnectors }) => {
    const owner = await seed.owner();
    const member = listedLinearChloe("suspended");
    await postFakeControl(fakeConnectors.url, `linear/members/${member.values.email}/suspend`);
    const linear = await scannedLinear(orm, fakeConnectors.url);
    const changes = accountChanges(orm, { connectorsUrl: fakeConnectors.url });
    const change = await changes.changeAccount(owner, {
      appAccountId: linear.account(member.values.email).id,
      action: "remove",
    });
    await postFakeControl(fakeConnectors.url, `linear/members/${member.values.email}/remove`);
    const email = "renamed@acme.example";
    const renamed = { ...member, values: { ...member.values, email } };
    const workspace = await serveAccountList(fakeConnectors.url, (_request, response) =>
      response.json({ accounts: [renamed], nextCursor: null }),
    );
    const scan =
      when === "before cleanup"
        ? scans(orm, { connectors: containerConnectors(workspace.url) })
        : await scanAfterFirstPage(orm, workspace.url, () => changes.runChange(SYSTEM, change.id));
    await scan.scanNow(owner, linear.connectionId);

    await scan.runScan(SYSTEM, linear.sourceId);

    if (when === "before cleanup") await changes.runChange(SYSTEM, change.id);

    expect(await changes.readAccountChange(owner, change.id)).toMatchObject({
      status: "succeeded",
    });
    expect(
      (await storedImportRecords(orm)).find(
        (row) => row.sourceId === linear.sourceId && row.sourceKey === member.sourceKey,
      )?.values,
    ).toMatchObject({ email });
    expect(await storedAppAccounts(orm)).toContainEqual(
      expect.objectContaining({ appId: linear.appId, email }),
    );
  },
);

test("removing a member on the first Slack page does not drop the member shifted across the next offset", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const { source } = await scannedSlack(orm, seed, fakeConnectors);
  const owner = OWNER;
  const before = await storedAppAccounts(orm);
  const elif = before.find(({ email }) => email === "elif@acme.example")!;
  const changes = accountChanges(orm, { connectorsUrl: fakeConnectors.url });
  const change = await changes.changeAccount(owner, { appAccountId: elif.id, action: "remove" });
  const scan = await scanAfterFirstPage(orm, fakeConnectors.url, () =>
    changes.runChange(SYSTEM, change.id),
  );
  await scan.scanNow(owner, source.connectionId);

  await scan.runScan(SYSTEM, source.id);

  expect((await storedAppAccounts(orm)).map(({ id }) => id)).toEqual(
    before.filter(({ id }) => id !== elif.id).map(({ id }) => id),
  );
});

test("a full Slack scan finishes while Remove waits behind another queued change", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const { source, scan } = await scannedSlack(orm, seed, fakeConnectors);
  const before = await storedAppAccounts(orm);
  const ana = before.find(({ email }) => email === "ana@acme.example")!;
  const elif = before.find(({ email }) => email === "elif@acme.example")!;
  const changes = accountChanges(orm, { connectorsUrl: fakeConnectors.url });
  await changes.changeAccount(OWNER, { appAccountId: ana.id, action: "suspend" });
  const queued = await changes.changeAccount(OWNER, { appAccountId: elif.id, action: "remove" });
  expect(queued.changesAhead).toBe(1);
  await postFakeControl(fakeConnectors.url, "slack/members/reports@acme.example/suspend");
  await scan.scanNow(OWNER, source.connectionId);

  await scan.runScan(SYSTEM, source.id);

  expect(await scan.readScan(OWNER, source.connectionId)).toMatchObject({ status: "scanned" });
  const after = await storedAppAccounts(orm);
  expect(after.map(({ id }) => id)).toEqual(before.map(({ id }) => id));
  expect(after.find(({ email }) => email === "reports@acme.example")?.status).toBe("suspended");
});

test("a running Remove lets a scan record the active replacement at the same email", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const owner = await seed.owner();
  const linear = await scannedLinear(orm, fakeConnectors.url);
  const account = linear.account("hannah@acme.example");
  const service = accountChanges(orm, { connectorsUrl: fakeConnectors.url });
  const change = await service.changeAccount(owner, { appAccountId: account.id, action: "remove" });
  await postFakeControl(fakeConnectors.url, `linear/members/${account.email}/remove`);
  await postFakeControl(fakeConnectors.url, "linear/invitations", { email: account.email });
  await postFakeControl(fakeConnectors.url, `linear/invitations/${account.email}/accept`);
  await linear.scans.scanNow(owner, linear.connectionId);

  await linear.scans.runScan(SYSTEM, linear.sourceId);
  await service.runChange(SYSTEM, change.id);

  expect((await storedAppAccounts(orm)).find((row) => row.id === account.id)).toMatchObject({
    email: account.email,
    status: "active",
  });
  expect((await service.readChangeStates(owner, [account.id])).get(account.id)?.offersRemove).toBe(
    false,
  );
});

test("leaves Chloé's suspension and its history line to the owner's running Disable", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const owner = await seed.owner();
  const linear = await scannedLinear(orm, fakeConnectors.url);
  const chloe = linear.account("chloe@acme.example");
  const changes = accountChanges(orm, { connectorsUrl: fakeConnectors.url });
  const change = await changes.changeAccount(owner, { appAccountId: chloe.id, action: "suspend" });
  const suspended = await fetch(
    `${fakeConnectors.url}/_fake/linear/members/${chloe.email}/suspend`,
    { method: "POST" },
  );
  expect(suspended.status).toBe(204);
  const accountHistory = async () =>
    (await storedRecordHistory(orm)).filter(({ recordId }) => recordId === chloe.id);
  const before = await accountHistory();
  await linear.scans.scanNow(owner, linear.connectionId);

  await linear.scans.runScan(SYSTEM, linear.sourceId);

  expect(await linear.scans.readScan(owner, linear.connectionId)).toMatchObject({
    status: "scanned",
  });
  const savedStatus = async () =>
    (await storedAppAccounts(orm)).find(({ id }) => id === chloe.id)?.status;
  expect(await savedStatus()).toBe("active");
  expect(await accountHistory()).toEqual(before);

  await changes.runChange(SYSTEM, change.id);

  expect(await savedStatus()).toBe("suspended");
  expect(await accountHistory()).toMatchObject([
    ...before,
    {
      causeKind: "changed_in_app",
      causeRef: change.id,
      authorKind: "signed_in_user",
      authorId: owner.user!.userId,
      changes: [{ field: "status", oldValue: "active", newValue: "suspended" }],
    },
  ]);
});

async function scannedSlack(orm: Orm, seed: TestSeed, fakeConnectors: RunningFakeConnectors) {
  const owner = OWNER;
  await seed.user({ id: owner.user!.userId, email: owner.user!.email });
  const { service, handOver, scans: initialScan } = await ownerHandOver(orm, fakeConnectors);
  const { connection } = await service.connect(owner, {
    connector: "slack",
    appSession: handOver.appSession,
    noticeAccepted: true,
  });
  const source = (await storedImportSources(orm)).find(
    (row) => row.connectionId === connection!.id,
  )!;
  await initialScan.runScan(SYSTEM, source.id);
  return { source, scan: initialScan };
}
