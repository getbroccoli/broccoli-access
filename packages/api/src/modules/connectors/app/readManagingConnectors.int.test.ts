import {
  containerConnections,
  EMPLOYEE,
  expect,
  LINEAR_INPUT,
  OWNER,
  serveManifest,
  test,
} from "#test/support";

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

test("leaves out Linear when its connector can suspend but cannot reactivate", async ({
  orm,
  fakeConnectors,
}) => {
  const server = await serveManifest(fakeConnectors.url, ({ connectors }) => {
    const linear = connectors.find(({ key }) => key === "linear")!;
    linear.capabilities = ["list_accounts", "suspend"];
  });
  const { service } = containerConnections(orm, server.url);

  const managing = await service.readManagingConnectors(OWNER, ["slack", "linear"]);

  expect([...managing.keys()]).toEqual(["slack"]);
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
