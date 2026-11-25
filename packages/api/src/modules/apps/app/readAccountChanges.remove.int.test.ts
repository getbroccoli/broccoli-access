import {
  accountChanges,
  expect,
  failedDisable,
  listedLinearChloe,
  scannedLinear,
  serveAccountList,
  serveManifest,
  test,
} from "#test/support";

test("a Disable done by hand cannot offer Remove until a scan finds the member suspended", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const { service, chloe, change, owner } = await failedDisable(orm, seed, fakeConnectors.url);
  await service.markChangeDoneByHand(owner, change.id);

  const states = await service.readChangeStates(owner, [chloe.id]);

  expect(states.get(chloe.id)).toMatchObject({ offeredChange: "reactivate", offersRemove: false });
  await expect(
    service.changeAccount(owner, { appAccountId: chloe.id, action: "remove" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});

test("keeps Enable when Linear does not list Remove", async ({ orm, seed, fakeConnectors }) => {
  const owner = await seed.owner();
  const linear = await scannedLinear(orm, fakeConnectors.url);
  const appAccountId = linear.account("hannah@acme.example").id;
  const manifest = await serveManifest(fakeConnectors.url, ({ connectors }) => {
    const connector = connectors.find(({ key }) => key === "linear")!;
    connector.capabilities = connector.capabilities.filter((capability) => capability !== "remove");
  });
  const service = accountChanges(orm, { connectorsUrl: manifest.url });

  const states = await service.readChangeStates(owner, [appAccountId]);

  expect(states.get(appAccountId)).toMatchObject({
    offeredChange: "reactivate",
    offersRemove: false,
  });
  await expect(
    service.changeAccount(owner, { appAccountId, action: "remove" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});

test("refuses Remove on the disabled member whose key connects Linear", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const member = listedLinearChloe("suspended");
  member.values.isConnectionUser = true;
  const server = await serveAccountList(fakeConnectors.url, (_request, response) => {
    response.json({ accounts: [member], nextCursor: null });
  });
  const linear = await scannedLinear(orm, server.url);
  const appAccountId = linear.account(member.values.email).id;
  const service = accountChanges(orm, { connectorsUrl: server.url });
  const owner = await seed.owner();

  expect((await service.readChangeStates(owner, [appAccountId])).get(appAccountId)).toMatchObject({
    isConnectionUser: true,
    offersRemove: false,
  });
  await expect(
    service.changeAccount(owner, { appAccountId, action: "remove" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});
