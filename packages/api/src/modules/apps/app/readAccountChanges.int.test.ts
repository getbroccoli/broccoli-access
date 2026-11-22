import { CONNECTOR_MANIFEST } from "@broccoli-access/connector-contract";
import express from "express";

import {
  accountChanges,
  expect,
  googleScanWithLinearGrant,
  googleScanSetup,
  OWNER,
  scannedLinear,
  listedLinearChloe,
  serveAccountList,
  serveConnectorRoutes,
  storedAppConnections,
  test,
  EMPLOYEE,
  SYSTEM,
  connectLinear,
} from "#test/support";

import type { Orm } from "../../../core/db";

test("offers Disable or Enable only for another member in the last Linear scan", async ({
  orm,
  fakeGoogle,
  fakeConnectors,
}) => {
  await googleScanWithLinearGrant(orm, fakeGoogle.url, "elif@acme.example");
  const linear = await scannedLinear(orm, fakeConnectors.url);
  const service = accountChanges(orm, { connectorsUrl: fakeConnectors.url });
  const ids = ["chloe", "hannah", "admin", "elif"].map(
    (name) => linear.account(`${name}@acme.example`).id,
  );

  const states = await service.readChangeStates(OWNER, ids);

  expect(ids.map((id) => states.get(id))).toEqual([
    { isConnectionUser: false, offeredChange: "suspend", latestChange: null },
    { isConnectionUser: false, offeredChange: "reactivate", latestChange: null },
    { isConnectionUser: true, offeredChange: null, latestChange: null },
    { isConnectionUser: false, offeredChange: null, latestChange: null },
  ]);
});

test("offers no change on Chloé when Linear lists only the owner's browser runtime", async ({
  orm,
  fakeConnectors,
}) => {
  const { service, appAccountId } = await browserOnlyLinear(orm, fakeConnectors.url);

  const states = await service.readChangeStates(OWNER, [appAccountId]);

  expect(states.get(appAccountId)?.offeredChange).toBeNull();
});

test("omits Linear from apps with changeable accounts when it lists only the owner's browser runtime", async ({
  orm,
  fakeConnectors,
}) => {
  const { service, appId } = await browserOnlyLinear(orm, fakeConnectors.url);

  const apps = await service.findAppsWithChangeableAccounts(OWNER, [appId]);

  expect(apps.has(appId)).toBe(false);
});

test("refuses Disable when Linear lists only the owner's browser runtime", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const { service, appAccountId } = await browserOnlyLinear(orm, fakeConnectors.url);
  const owner = await seed.owner();

  await expect(
    service.changeAccount(owner, { appAccountId, action: "suspend" }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
  });
});

test.for([
  { status: "active", action: "suspend" },
  { status: "suspended", action: "reactivate" },
] as const)(
  "refuses $action when two Linear members share one email",
  async ({ status, action }, { orm, seed, fakeConnectors }) => {
    const member = listedLinearChloe(status);
    const server = await serveAccountList(fakeConnectors.url, (_request, response) => {
      response.json({
        accounts: [member, { ...member, sourceKey: "another-member" }],
        nextCursor: null,
      });
    });
    const linear = await scannedLinear(orm, server.url);
    const appAccountId = linear.account(member.values.email).id;
    const owner = await seed.owner();
    const service = accountChanges(orm, { connectorsUrl: server.url });

    const states = await service.readChangeStates(owner, [appAccountId]);

    expect(states.get(appAccountId)?.offeredChange).toBeNull();
    await expect(service.changeAccount(owner, { appAccountId, action })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(
      (await service.readChangeStates(owner, [appAccountId])).get(appAccountId)?.latestChange,
    ).toBeNull();
  },
);

test("identifies the connection's user when another Linear member shares their email", async ({
  orm,
  fakeConnectors,
}) => {
  const member = listedLinearChloe("active");
  const connectionUser = {
    ...member,
    sourceKey: "connection-user",
    values: { ...member.values, isConnectionUser: true },
  };
  const server = await serveAccountList(fakeConnectors.url, (_request, response) => {
    response.json({ accounts: [member, connectionUser], nextCursor: null });
  });
  const linear = await scannedLinear(orm, server.url);
  const appAccountId = linear.account(member.values.email).id;
  const service = accountChanges(orm, { connectorsUrl: server.url });

  const states = await service.readChangeStates(OWNER, [appAccountId]);

  expect(states.get(appAccountId)).toMatchObject({ isConnectionUser: true, offeredChange: null });
});

test("counts earlier running changes on the connection and stops counting finished changes", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const owner = await seed.owner();
  const linear = await scannedLinear(orm, fakeConnectors.url);
  const service = accountChanges(orm, { connectorsUrl: fakeConnectors.url });
  const chloe = linear.account("chloe@acme.example").id;
  const ana = linear.account("ana@acme.example").id;
  const first = await service.changeAccount(owner, { appAccountId: chloe, action: "suspend" });
  const second = await service.changeAccount(owner, { appAccountId: ana, action: "suspend" });

  const queued = await service.readChangeStates(owner, [chloe, ana]);

  expect(queued.get(chloe)).toMatchObject({
    offeredChange: null,
    latestChange: { id: first.id, status: "running", changesAhead: 0 },
  });
  expect(queued.get(ana)).toMatchObject({
    offeredChange: null,
    latestChange: { id: second.id, status: "running", changesAhead: 1 },
  });
  await service.runChange(SYSTEM, first.id);
  const after = await service.readChangeStates(owner, [chloe, ana]);
  expect(after.get(chloe)?.latestChange).toMatchObject({ id: first.id, changesAhead: null });
  expect(after.get(ana)?.latestChange).toMatchObject({ id: second.id, changesAhead: 0 });
});

test("finds Linear among a changeable connection, a directory and an unconnected app", async ({
  orm,
  seed,
  fakeGoogle,
  fakeConnectors,
}) => {
  await googleScanSetup(orm, fakeGoogle.url);
  const [google] = await storedAppConnections(orm);
  const linear = await connectLinear(orm, fakeConnectors.url);
  const slack = await seed.app({ status: "approved" });
  const service = accountChanges(orm, { connectorsUrl: fakeConnectors.url });

  expect(
    await service.findAppsWithChangeableAccounts(OWNER, [google!.appId, linear.appId, slack.id]),
  ).toEqual(new Set([linear.appId]));
});

test.for(["readChangeStates", "findAppsWithChangeableAccounts"] as const)(
  "refuses %s for an employee",
  async (method, { orm, fakeConnectors }) => {
    const service = accountChanges(orm, { connectorsUrl: fakeConnectors.url });
    await expect(service[method](EMPLOYEE, [])).rejects.toMatchObject({ code: "FORBIDDEN" });
  },
);

async function browserOnlyLinear(orm: Orm, fakeUrl: string) {
  const linear = await scannedLinear(orm, fakeUrl);
  const manifest = CONNECTOR_MANIFEST.parse(await (await fetch(`${fakeUrl}/v1/connectors`)).json());
  manifest.connectors.find(({ key }) => key === "linear")!.runtimes = ["owner_browser"];
  const app = express();
  app.get("/v1/connectors", (_request, response) => response.json(manifest));
  const server = await serveConnectorRoutes(fakeUrl, app);
  return {
    service: accountChanges(orm, { connectorsUrl: server.url }),
    appAccountId: linear.account("chloe@acme.example").id,
    appId: linear.appId,
  };
}
