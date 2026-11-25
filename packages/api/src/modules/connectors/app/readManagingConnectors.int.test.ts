import {
  apps,
  containerConnections,
  EMPLOYEE,
  expect,
  LINEAR_INPUT,
  OWNER,
  serveManifest,
  test,
} from "#test/support";

test("matches only Slack among discovered apps even when everyone uses Figma", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  await seed.app({ name: "Slack", catalogKey: "slack" });
  const figma = await seed.app({ name: "Figma", domain: "figma.com", catalogKey: "figma" });
  const directory = await seed.app({
    name: "Google Workspace",
    domain: "workspace.google.com",
    catalogKey: "google_workspace",
    status: "approved",
  });
  const employee = await seed.employee();
  const account = { employeeId: employee.id, email: employee.email };
  await seed.appAccount({ ...account, appId: directory.id, foundVia: ["google_directory"] });
  await seed.appAccount({ ...account, appId: figma.id });
  const { edges } = await apps(orm).listApps(OWNER, { status: "discovered" });
  const catalogKeys = edges.flatMap(({ node }) => (node.catalogKey ? [node.catalogKey] : []));
  const { service } = containerConnections(orm, fakeConnectors.url);

  const managing = await service.readManagingConnectors(OWNER, catalogKeys);

  expect(edges.map(({ node }) => node)).toMatchObject([
    { catalogKey: "figma", peopleCount: 1 },
    { catalogKey: "slack", peopleCount: 0 },
  ]);
  expect([...managing.keys()]).toEqual(["slack"]);
});

test("only Slack and Linear have managing connectors among the requested apps", async ({
  orm,
  fakeConnectors,
}) => {
  const { service } = containerConnections(orm, fakeConnectors.url);

  const managing = await service.readManagingConnectors(OWNER, [
    "slack",
    "linear",
    "notion",
    "google_workspace",
  ]);

  expect([...managing.keys()].sort()).toEqual(["linear", "slack"]);
  for (const key of ["slack", "linear"]) {
    expect(managing.get(key)).toMatchObject({ connector: { key }, connection: null });
  }
});

test("offers Connect on the app page for a list-only connector", async ({
  orm,
  fakeConnectors,
}) => {
  const server = await serveManifest(fakeConnectors.url, ({ connectors }) => {
    const linear = connectors.find(({ key }) => key === "linear")!;
    linear.capabilities = ["list_accounts"];
  });
  const { service } = containerConnections(orm, server.url);

  const managing = await service.readManagingConnectors(OWNER, ["slack", "linear"]);

  expect(managing.get("linear")).toMatchObject({ connector: { key: "linear" }, connection: null });
});

test("returns Linear's saved connection with its managing connector", async ({
  orm,
  fakeConnectors,
}) => {
  const { service } = containerConnections(orm, fakeConnectors.url);
  const saved = await service.connect(OWNER, LINEAR_INPUT);

  const managing = await service.readManagingConnectors(OWNER, ["linear"]);

  expect(managing.get("linear")).toMatchObject({
    connector: { key: "linear" },
    connection: { id: saved.connection!.id },
  });
});

test("refuses an employee reading managing connectors", async ({ orm, fakeConnectors }) => {
  const { service } = containerConnections(orm, fakeConnectors.url);

  await expect(service.readManagingConnectors(EMPLOYEE, ["linear"])).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
