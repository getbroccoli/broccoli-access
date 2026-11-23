import { accountChanges, EMPLOYEE, expect, OWNER, test, type TestSeed } from "#test/support";

test("lists every Disable and Enable newest first with its outcome", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const source = await changeSource(seed);
  const account = await seed.appAccount({ appId: source.appId });
  const target = { ...source, appAccountId: account.id, email: account.email };
  const failed = await seed.accountChange({
    ...target,
    requestedAt: new Date("2026-03-02"),
    status: "failed",
    error: "not_allowed",
  });
  const running = await seed.accountChange({
    ...target,
    requestedAt: new Date("2026-03-04"),
    status: "running",
  });
  const succeeded = await seed.accountChange({
    ...target,
    requestedAt: new Date("2026-03-01"),
    action: "reactivate",
  });
  const manual = await seed.accountChange({
    ...target,
    requestedAt: new Date("2026-03-03"),
    status: "done_by_hand",
    error: "authentication_failed",
  });
  const service = accountChanges(orm, { connectorsUrl: fakeConnectors.url });

  const { edges } = await service.listAccountChanges(OWNER, {});

  expect(edges.map(({ node }) => node)).toMatchObject([
    { id: running.id, action: "suspend", status: "running", error: null },
    { id: manual.id, action: "suspend", status: "done_by_hand", error: "authentication_failed" },
    { id: failed.id, action: "suspend", status: "failed", error: "not_allowed" },
    { id: succeeded.id, action: "reactivate", status: "succeeded", error: null },
  ]);
});

test("keeps the app and email of a change whose app account was deleted", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const source = await changeSource(seed);
  const change = await seed.accountChange({
    ...source,
    appAccountId: null,
    email: "former@example.com",
    requestedAt: new Date("2026-03-01"),
  });
  const service = accountChanges(orm, { connectorsUrl: fakeConnectors.url });

  const { edges } = await service.listAccountChanges(OWNER, {});

  expect(edges).toMatchObject([
    {
      node: { id: change.id, appAccountId: null, appId: source.appId, email: "former@example.com" },
    },
  ]);
});

test("pages through changes asked at the same time without repeats or gaps", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const source = await changeSource(seed);
  const tied = { ...source, requestedAt: new Date("2026-03-01") };
  const a = await seed.accountChange(tied);
  const b = await seed.accountChange(tied);
  const [higherId, lowerId] = [a.id, b.id].sort().reverse();
  const newest = await seed.accountChange({ ...source, requestedAt: new Date("2026-03-02") });
  const service = accountChanges(orm, { connectorsUrl: fakeConnectors.url });

  const first = await service.listAccountChanges(OWNER, { first: 2 });
  const rest = await service.listAccountChanges(OWNER, {
    first: 2,
    after: first.pageInfo.endCursor,
  });

  expect(first.edges.map(({ node }) => node.id)).toEqual([newest.id, higherId]);
  expect(first.pageInfo.hasNextPage).toBe(true);
  expect(rest.edges.map(({ node }) => node.id)).toEqual([lowerId]);
  expect(rest.pageInfo.hasNextPage).toBe(false);
});

test("counts only earlier running changes on the same connection", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const source = await changeSource(seed);
  const otherApp = await seed.app({
    name: "Linear",
    catalogKey: "linear",
    domain: "linear.app",
    status: "approved",
  });
  const otherConnection = await seed.appConnection({ appId: otherApp.id, connector: "linear" });
  const other = await seed.accountChange({
    ...source,
    appId: otherApp.id,
    connectionId: otherConnection.id,
    requestedAt: new Date("2026-03-01"),
    status: "running",
  });
  const first = await seed.accountChange({
    ...source,
    requestedAt: new Date("2026-03-02"),
    status: "running",
  });
  const finished = await seed.accountChange({ ...source, requestedAt: new Date("2026-03-03") });
  const second = await seed.accountChange({
    ...source,
    requestedAt: new Date("2026-03-04"),
    status: "running",
  });
  const service = accountChanges(orm, { connectorsUrl: fakeConnectors.url });

  const { edges } = await service.listAccountChanges(OWNER, {});

  expect(edges.map(({ node }) => node)).toMatchObject([
    { id: second.id, changesAhead: 1 },
    { id: finished.id, changesAhead: null },
    { id: first.id, changesAhead: 0 },
    { id: other.id, changesAhead: 0 },
  ]);
});

test("refuses to list account changes without MANAGE_WORKSPACE", async ({
  orm,
  fakeConnectors,
}) => {
  const service = accountChanges(orm, { connectorsUrl: fakeConnectors.url });

  await expect(service.listAccountChanges(EMPLOYEE, {})).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

test("reads the requesters' names by user id", async ({ orm, seed, fakeConnectors }) => {
  const ana = await seed.user({ email: "ana@example.com", name: "Ana" });
  const mia = await seed.user({ email: "mia@example.com", name: "Mia" });
  await seed.user({ email: "chloe@example.com", name: "Chloé" });
  const service = accountChanges(orm, { connectorsUrl: fakeConnectors.url });

  const names = await service.readRequesterNames(OWNER, [mia.id, ana.id]);

  expect(names).toEqual(
    new Map([
      [ana.id, "Ana"],
      [mia.id, "Mia"],
    ]),
  );
});

async function changeSource(seed: TestSeed) {
  const app = await seed.app({ status: "approved" });
  const connection = await seed.appConnection({ appId: app.id, connector: "slack" });
  const requester = await seed.user({ email: "owner@example.com" });
  return { appId: app.id, connectionId: connection.id, requestedBy: requester.id };
}
