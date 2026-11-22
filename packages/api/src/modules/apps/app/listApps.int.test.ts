import { expect, test, OWNER, EMPLOYEE, SYSTEM, apps, googleScanSetup } from "#test/support";

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
