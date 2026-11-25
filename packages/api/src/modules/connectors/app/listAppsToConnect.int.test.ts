import {
  apps,
  containerConnections,
  EMPLOYEE,
  expect,
  LINEAR_INPUT,
  OWNER,
  serveManifest,
  storedApps,
  test,
} from "#test/support";

test("lists Linear with its catalog name, domain and connector when only Slack has an app", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  await seed.app();
  const { service } = containerConnections(orm, fakeConnectors.url);

  const listed = await service.listAppsToConnect(OWNER);

  expect(listed).toMatchObject([
    { catalogKey: "linear", name: "Linear", domain: "linear.app", connector: { key: "linear" } },
  ]);
});

test("lists a list-only app for Connect", async ({ orm, seed, fakeConnectors }) => {
  await seed.app();
  const server = await serveManifest(fakeConnectors.url, ({ connectors }) => {
    const linear = connectors.find(({ key }) => key === "linear")!;
    linear.capabilities = ["list_accounts"];
  });
  const { service } = containerConnections(orm, server.url);

  const listed = await service.listAppsToConnect(OWNER);

  expect(listed.map(({ catalogKey }) => catalogKey)).toEqual(["linear"]);
});

test("leaves an ignored Linear app out of the apps to connect", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  await seed.app({ name: "Linear", domain: "linear.app", catalogKey: "linear", status: "ignored" });
  const { service } = containerConnections(orm, fakeConnectors.url);

  const listed = await service.listAppsToConnect(OWNER);

  expect(listed.map(({ catalogKey }) => catalogKey)).toEqual(["slack"]);
});

test("listing apps to connect preserves stored apps and app counts", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  await seed.app();
  const { service } = containerConnections(orm, fakeConnectors.url);
  const counts = await apps(orm).countApps(OWNER);
  const rows = await storedApps(orm);

  await service.listAppsToConnect(OWNER);

  expect(await apps(orm).countApps(OWNER)).toEqual(counts);
  expect(await storedApps(orm)).toEqual(rows);
});

test("connecting Linear adds one approved app and removes it from the apps to connect", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  await seed.app();
  const { service } = containerConnections(orm, fakeConnectors.url);

  await service.connect(OWNER, LINEAR_INPUT);

  expect(await service.listAppsToConnect(OWNER)).toEqual([]);
  expect((await storedApps(orm)).filter(({ catalogKey }) => catalogKey === "linear")).toMatchObject(
    [{ status: "approved" }],
  );
});

test("leaves out a connector already connected to an app it matched by name", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  await seed.app();
  await seed.app({ name: "Linear", domain: null, catalogKey: null, status: "approved" });
  const { service } = containerConnections(orm, fakeConnectors.url);
  await service.connect(OWNER, LINEAR_INPUT);

  const listed = await service.listAppsToConnect(OWNER);

  expect(listed).toEqual([]);
});

test("lists no apps to connect without a connectors container", async ({ orm }) => {
  const { service } = containerConnections(orm, "");

  expect(await service.listAppsToConnect(OWNER)).toEqual([]);
});

test("refuses an employee listing apps to connect", async ({ orm, fakeConnectors }) => {
  const { service } = containerConnections(orm, fakeConnectors.url);

  await expect(service.listAppsToConnect(EMPLOYEE)).rejects.toMatchObject({ code: "FORBIDDEN" });
});
