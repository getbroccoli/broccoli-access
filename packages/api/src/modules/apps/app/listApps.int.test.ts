import {
  expect,
  test,
  OWNER,
  EMPLOYEE,
  SYSTEM,
  apps,
  googleScanSetup,
  googleScanWithLinearGrant,
  scannedLinear,
  storedApps,
} from "#test/support";

test("shows how many suspended people still have access to each approved app", async ({
  orm,
  fakeGoogle,
}) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);
  await scans.runScan(SYSTEM, sourceId);
  const service = apps(orm);
  const discovered = await service.listApps(OWNER, { status: "discovered" });
  const approvedAppIds = discovered.edges
    .filter(({ node }) => node.preselected)
    .map(({ node }) => node.id);
  await service.finishSetup(OWNER, { approvedAppIds });

  const { edges } = await service.listApps(OWNER, { status: "approved" });

  expect(edges.map(({ node }) => node)).toMatchObject([
    { name: "Google Workspace", peopleCount: 42, suspendedWithAccessCount: 0, connected: true },
    { name: "Slack", peopleCount: 41, suspendedWithAccessCount: 2, connected: false },
    { name: "Notion", peopleCount: 31, suspendedWithAccessCount: 1, connected: false },
    { name: "Figma", peopleCount: 16, suspendedWithAccessCount: 1, connected: false },
    { name: "Miro", peopleCount: 12, suspendedWithAccessCount: 0, connected: false },
    { name: "Loom", peopleCount: 11, suspendedWithAccessCount: 0, connected: false },
    { name: "Claude", peopleCount: 9, suspendedWithAccessCount: 0, connected: false },
  ]);
});

test("orders approved apps by the people their scans found", async ({
  orm,
  fakeGoogle,
  fakeConnectors,
}) => {
  await googleScanWithLinearGrant(orm, fakeGoogle.url, "ben@acme.example");
  await scannedLinear(orm, fakeConnectors.url);
  const service = apps(orm, { connectorsUrl: fakeConnectors.url });
  const chatGpt = (await storedApps(orm)).find(({ name }) => name === "ChatGPT")!;
  await service.approveApp(OWNER, chatGpt.id);

  const { edges } = await service.listApps(OWNER, { status: "approved" });

  expect(edges.map(({ node }) => node)).toMatchObject([
    { name: "Google Workspace", peopleCount: 42 },
    { name: "ChatGPT", peopleCount: 7 },
    { name: "Linear", peopleCount: 7 },
  ]);
});

test("lists discovered apps by most people first, then by name", async ({ orm, fakeGoogle }) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);
  await scans.runScan(SYSTEM, sourceId);

  const { edges } = await apps(orm).listApps(OWNER, { status: "discovered" });

  expect(edges).toHaveLength(37);
  expect(edges.slice(0, 12).map(({ node }) => node.name)).toEqual([
    "Slack",
    "Notion",
    "Figma",
    "Miro",
    "Loom",
    "Claude",
    "ChatGPT",
    "Canva",
    "Calendly",
    "Zoom",
    "Typeform",
    "Asana",
  ]);
  expect(edges[0]!.node).toMatchObject({
    name: "Slack",
    domain: "slack.com",
    status: "discovered",
    peopleCount: 41,
    foundVia: ["google_sign_in"],
    since: { at: expect.any(Date) as unknown, before: expect.any(Boolean) as unknown },
  });
  expect(edges.find(({ node }) => node.name === "Grammarly")!.node.peopleCount).toBe(2);
});

test("preselects exactly the six apps used by at least a fifth of the directory", async ({
  orm,
  fakeGoogle,
}) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);
  await scans.runScan(SYSTEM, sourceId);

  const { edges } = await apps(orm).listApps(OWNER, { status: "discovered" });

  expect(edges.filter(({ node }) => node.preselected).map(({ node }) => node.name)).toEqual([
    "Slack",
    "Notion",
    "Figma",
    "Miro",
    "Loom",
    "Claude",
  ]);
});

test("pages from the first twelve discovered apps to the remaining twenty-five without repeats", async ({
  orm,
  fakeGoogle,
}) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);
  await scans.runScan(SYSTEM, sourceId);
  const service = apps(orm);

  const first = await service.listApps(OWNER, { status: "discovered", first: 12 });
  const rest = await service.listApps(OWNER, {
    status: "discovered",
    after: first.pageInfo.endCursor,
  });

  expect(first.edges).toHaveLength(12);
  expect(first.pageInfo.hasNextPage).toBe(true);
  expect(first.pageInfo.endCursor).toEqual(expect.any(String));
  expect(rest.edges).toHaveLength(25);
  expect(rest.pageInfo.hasNextPage).toBe(false);
  expect(new Set([...first.edges, ...rest.edges].map(({ node }) => node.id)).size).toBe(37);
});

test("counts Google Workspace as approved and the 37 found apps as discovered", async ({
  orm,
  fakeGoogle,
}) => {
  const { scans, sourceId } = await googleScanSetup(orm, fakeGoogle.url);
  await scans.runScan(SYSTEM, sourceId);

  const counts = await apps(orm).countApps(OWNER);

  expect(counts).toEqual({ approved: 1, discovered: 37, ignored: 0 });
});

test("refuses to list apps without MANAGE_WORKSPACE", async ({ orm }) => {
  await expect(apps(orm).listApps(EMPLOYEE, { status: "discovered" })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

test("refuses to count apps without MANAGE_WORKSPACE", async ({ orm }) => {
  await expect(apps(orm).countApps(EMPLOYEE)).rejects.toMatchObject({ code: "FORBIDDEN" });
});
