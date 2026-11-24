import {
  connectLinear,
  containerConnectors,
  expect,
  googleScanWithLinearGrant,
  OWNER,
  scans,
  serveAccountList,
  storedAppAccounts,
  storedEmployeeAppChoices,
  storedEmployees,
  SYSTEM,
  templateReviewTransactor,
  templates,
  test,
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
  await next.scanNow(OWNER, linear.connectionId);
  await next.runScan(SYSTEM, linear.sourceId);
  expect(await state()).toBe("active");
});
