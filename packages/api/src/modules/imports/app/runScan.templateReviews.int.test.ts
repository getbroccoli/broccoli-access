import {
  connectLinear,
  containerConnectors,
  expect,
  googleScanWithLinearGrant,
  OWNER,
  holdBeforeCommit,
  scannedLinear,
  scans,
  serveAccountList,
  storedAppAccounts,
  storedEmployeeAppChoices,
  storedEmployees,
  recordHistory,
  SYSTEM,
  templateReviewTransactor,
  templates,
  test,
  withLockTimeout,
} from "#test/support";

test("a first empty member scan ends review so an account found later returns as active", async ({
  orm,
  seed,
  fakeGoogle,
  fakeConnectors,
}) => {
  const email = "chloe@acme.example";
  const google = await googleScanWithLinearGrant(orm, fakeGoogle.url, email);
  const chloe = (await storedEmployees(orm)).find((person) => person.email === email)!;
  const linear = await connectLinear(orm, fakeConnectors.url);
  const engineer = await seed.template({ appIds: [linear.appId] });
  await seed.employeeTemplate({
    templateId: engineer.id,
    employeeId: chloe.id,
    assignedBy: google.ownerUserId,
  });
  const service = templates(orm, { connectors: containerConnectors(fakeConnectors.url) });
  await service.takeOff(OWNER, { id: engineer.id, employeeId: chloe.id });
  const state = async () => {
    const [rows] = await service.readEmployeeApps(OWNER, [chloe.id]);
    return rows!.find(({ appId }) => appId === linear.appId)?.state;
  };
  expect(await state()).toBe("extra");
  const accounts = await storedAppAccounts(orm);
  const empty = await serveAccountList(fakeConnectors.url, (_request, response) => {
    response.json({ accounts: [], invitations: [], nextCursor: null });
  });
  const transact = templateReviewTransactor(orm);
  const first = scans(orm, { transact, connectors: containerConnectors(empty.url) });
  const next = scans(orm, { transact, connectors: containerConnectors(fakeConnectors.url) });

  await first.runScan(SYSTEM, linear.sourceId);

  expect(await first.readScan(OWNER, linear.connectionId)).toMatchObject({ status: "scanned" });
  expect(await storedAppAccounts(orm)).toEqual(accounts);
  expect.soft(await storedEmployeeAppChoices(orm)).toEqual([]);
  const history = await recordHistory.read(orm, "employee", chloe.id, { first: 1 });
  expect(history.edges[0]?.node).toMatchObject({
    author: { kind: "BROCCOLI_ITSELF", id: null },
    cause: { kind: "FOUND_BY_SCAN", ref: linear.sourceId },
    changes: [{ field: "appChoice", oldValue: linear.appId, newValue: null }],
  });
  await next.scanNow(OWNER, linear.connectionId);
  await next.runScan(SYSTEM, linear.sourceId);
  expect(await state()).toBe("active");
});

test("an unchanged repeat member scan finishes while a review for that app is being written", async ({
  orm,
  seed,
  transact,
  fakeConnectors,
}) => {
  const chloe = await seed.employee({ email: "chloe@acme.example" });
  const linear = await scannedLinear(orm, fakeConnectors.url);
  const user = await seed.user({ email: "owner@example.com" });
  const template = await seed.template({ appIds: [linear.appId] });
  await seed.employeeTemplate({
    employeeId: chloe.id,
    templateId: template.id,
    assignedBy: user.id,
  });
  const scan = scans(orm, {
    connectors: containerConnectors(fakeConnectors.url),
    transact: withLockTimeout(templateReviewTransactor(orm)),
  });
  await scan.scanNow(OWNER, linear.connectionId);
  const held = holdBeforeCommit(transact);
  const removing = templates(orm, { transact: held.transact }).takeOff(OWNER, {
    id: template.id,
    employeeId: chloe.id,
  });

  try {
    await held.ready;
    await scan.runScan(SYSTEM, linear.sourceId);
    expect(await scan.readScan(OWNER, linear.connectionId)).toMatchObject({ status: "scanned" });
  } finally {
    held.release();
    await removing;
  }
  expect(await storedEmployeeAppChoices(orm)).toMatchObject([
    { employeeId: chloe.id, appId: linear.appId, choice: "to_review" },
  ]);
});
