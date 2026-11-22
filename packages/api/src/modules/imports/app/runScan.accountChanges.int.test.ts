import {
  accountChanges,
  containerConnectors,
  expect,
  linearMemberStatus,
  listedLinearChloe,
  scannedLinear,
  scans,
  serveAccountList,
  storedAppAccounts,
  storedRecordHistory,
  SYSTEM,
  test,
} from "#test/support";

test("keeps Chloé suspended when a scan saves the active status it read before Disable finished", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const owner = await seed.owner();
  const linear = await scannedLinear(orm, fakeConnectors.url);
  const member = listedLinearChloe("active");
  const chloe = linear.account(member.values.email);
  const read = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const server = await serveAccountList(fakeConnectors.url, async (_request, response) => {
    read.resolve();
    await release.promise;
    response.json({ accounts: [member], nextCursor: null });
  });
  const changes = accountChanges(orm, { connectorsUrl: server.url });
  const change = await changes.changeAccount(owner, { appAccountId: chloe.id, action: "suspend" });
  const scan = scans(orm, { connectors: containerConnectors(server.url) });
  await scan.scanNow(owner, linear.connectionId);

  const saving = scan.runScan(SYSTEM, linear.sourceId);
  try {
    await read.promise;
    await changes.runChange(SYSTEM, change.id);
    expect(await linearMemberStatus(fakeConnectors.url, chloe.email)).toBe("suspended");
  } finally {
    release.resolve();
    await saving;
  }

  expect(await scan.readScan(owner, linear.connectionId)).toMatchObject({ status: "scanned" });
  expect((await storedAppAccounts(orm)).find(({ id }) => id === chloe.id)?.status).toBe(
    "suspended",
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
