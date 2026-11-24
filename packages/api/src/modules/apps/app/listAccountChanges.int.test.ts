import { accountChanges, EMPLOYEE, expect, OWNER, test, type TestSeed } from "#test/support";

import { ApplicationError } from "../../../core/applicationError";

test("lists every Disable and Enable newest first with its outcome", async ({ orm, seed }) => {
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
  const service = accountChanges(orm);

  const { edges } = await service.listAccountChanges(OWNER, {});

  expect(edges.map(({ node }) => node)).toMatchObject([
    { id: running.id, action: "suspend", status: "running", error: null },
    { id: manual.id, action: "suspend", status: "done_by_hand", error: "authentication_failed" },
    { id: failed.id, action: "suspend", status: "failed", error: "not_allowed" },
    { id: succeeded.id, action: "reactivate", status: "succeeded", error: null },
  ]);
});

test("lists Ivan's invite beside a Disable, newest first", async ({ orm, seed }) => {
  const source = await changeSource(seed);
  const account = await seed.appAccount({ appId: source.appId });
  const disable = await seed.accountChange({
    ...source,
    appAccountId: account.id,
    email: account.email,
    requestedAt: new Date("2026-03-01"),
  });
  const invite = await seed.accountChange({
    ...source,
    email: "ivan@acme.example",
    appAccountId: null,
    sourceKey: null,
    action: "invite",
    requestedAt: new Date("2026-03-02"),
  });

  const { edges } = await accountChanges(orm).listAccountChanges(OWNER, {});

  expect(edges.map(({ node }) => node)).toMatchObject([
    {
      id: invite.id,
      action: "invite",
      email: "ivan@acme.example",
      appAccountId: null,
      appId: source.appId,
    },
    { id: disable.id, action: "suspend", appAccountId: account.id },
  ]);
});

test("keeps the app and email of a change whose app account was deleted", async ({ orm, seed }) => {
  const source = await changeSource(seed);
  const change = await seed.accountChange({
    ...source,
    appAccountId: null,
    email: "former@example.com",
    requestedAt: new Date("2026-03-01"),
  });
  const service = accountChanges(orm);

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
}) => {
  const source = await changeSource(seed);
  const tied = { ...source, requestedAt: new Date("2026-03-01") };
  const a = await seed.accountChange(tied);
  const b = await seed.accountChange(tied);
  const [higherId, lowerId] = [a.id, b.id].sort().reverse();
  const newest = await seed.accountChange({ ...source, requestedAt: new Date("2026-03-02") });
  const service = accountChanges(orm);

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

test("rejects an Activity cursor with year zero as invalid input", async ({ orm, seed }) => {
  const source = await changeSource(seed);
  await seed.accountChange({ ...source, requestedAt: new Date("2026-03-01") });
  const values = [
    "REQUESTED_AT",
    "DESC",
    "0000-01-01T00:00:00.000Z",
    "00000000-0000-4000-8000-000000000001",
  ];
  const after = Buffer.from(JSON.stringify(values)).toString("base64url");

  const page = accountChanges(orm).listAccountChanges(OWNER, { after });

  await expect(page).rejects.toBeInstanceOf(ApplicationError);
  await expect(page).rejects.toMatchObject({ code: "INVALID_INPUT" });
});

test("counts only earlier running changes on the same connection", async ({ orm, seed }) => {
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
  const service = accountChanges(orm);

  const { edges } = await service.listAccountChanges(OWNER, {});

  expect(edges.map(({ node }) => node)).toMatchObject([
    { id: second.id, changesAhead: 1 },
    { id: finished.id, changesAhead: null },
    { id: first.id, changesAhead: 0 },
    { id: other.id, changesAhead: 0 },
  ]);
});

test("refuses to list account changes without MANAGE_WORKSPACE", async ({ orm }) => {
  const service = accountChanges(orm);

  await expect(service.listAccountChanges(EMPLOYEE, {})).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

test("reads the requesters' names by user id", async ({ orm, seed }) => {
  const ana = await seed.user({ email: "ana@example.com", name: "Ana" });
  const mia = await seed.user({ email: "mia@example.com", name: "Mia" });
  await seed.user({ email: "chloe@example.com", name: "Chloé" });
  const service = accountChanges(orm);

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
