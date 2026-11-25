import { CONNECTOR_MANIFEST } from "@broccoli-access/connector-contract";
import express from "express";

import {
  accountChanges,
  accountLinks,
  CREATION_START,
  expect,
  failedDisable,
  googleScanWithLinearGrant,
  googleScanSetup,
  integrationUserTest,
  OWNER,
  postFakeControl,
  scans,
  scannedLinear,
  listedLinearChloe,
  serveAccountList,
  serveConnectorRoutes,
  storedAppConnections,
  storedImportSources,
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
    {
      isConnectionUser: false,
      offeredChange: "suspend",
      offersReconnect: false,
      latestChange: null,
    },
    {
      isConnectionUser: false,
      offeredChange: "reactivate",
      offersReconnect: false,
      latestChange: null,
    },
    { isConnectionUser: true, offeredChange: null, offersReconnect: false, latestChange: null },
    { isConnectionUser: false, offeredChange: null, offersReconnect: false, latestChange: null },
  ]);
});

test.for(["service", "external"] as const)(
  "still offers and accepts Disable on an owner-marked %s account",
  async (kind, { orm, seed, fakeConnectors }) => {
    const owner = await seed.owner();
    const linear = await scannedLinear(orm, fakeConnectors.url);
    const { id } = linear.account("deploys@acme.example");
    await accountLinks(orm).markAccount(owner, {
      appAccountId: id,
      kind,
      note: "Release engineering",
    });
    const changes = accountChanges(orm, { connectorsUrl: fakeConnectors.url });

    expect((await changes.readChangeStates(owner, [id])).get(id)?.offeredChange).toBe("suspend");
    await expect(
      changes.changeAccount(owner, { appAccountId: id, action: "suspend" }),
    ).resolves.toMatchObject({ appAccountId: id, status: "running" });
  },
);

test("reads one account change by its id, and none for an unknown id", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const { service, owner, change } = await failedDisable(orm, seed, fakeConnectors.url);

  expect(await service.readAccountChange(owner, change.id)).toMatchObject({
    id: change.id,
    status: "failed",
    error: "unexpected_response",
    changesAhead: null,
  });
  expect(await service.readAccountChange(owner, "00000000-0000-4000-8000-000000000001")).toBeNull();
  await expect(service.readAccountChange(EMPLOYEE, change.id)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

integrationUserTest(
  "never offers or accepts Disable on the integration user's account, even one the owner marked",
  async ({ orm, workspace, fakeGoogle, fakeConnectors }) => {
    const { owner, users } = workspace;
    const { email } = CREATION_START;
    await users.finishCreation(owner, await workspace.allowCreation());
    await postFakeControl(fakeConnectors.url, "linear/invitations", { email });
    await postFakeControl(fakeConnectors.url, `linear/invitations/${email}/accept`);
    // Scanned before the directory, the account is nobody's yet, so the owner can mark it.
    const { id } = (await scannedLinear(orm, fakeConnectors.url)).account(email);
    await accountLinks(orm).markAccount(owner, {
      appAccountId: id,
      kind: "external",
      note: "Agency",
    });
    const [googleSource] = await storedImportSources(orm);
    await scans(orm, { googleUrl: fakeGoogle.url }).runScan(SYSTEM, googleSource!.id);
    const changes = accountChanges(orm, { connectorsUrl: fakeConnectors.url });

    expect((await changes.readChangeStates(owner, [id])).get(id)?.offeredChange).toBeNull();
    await expect(
      changes.changeAccount(owner, { appAccountId: id, action: "suspend" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  },
);

test("offers Reconnect instead of Disable to a Linear member but not to the connection's user", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const linear = await scannedLinear(orm, fakeConnectors.url);
  await seed.connectionNeedsReconnect(linear.connectionId);
  const member = linear.account("chloe@acme.example").id;
  const admin = linear.account("admin@acme.example").id;
  const service = accountChanges(orm, { connectorsUrl: fakeConnectors.url });

  const states = await service.readChangeStates(OWNER, [member, admin]);

  expect(states.get(member)).toMatchObject({ offeredChange: null, offersReconnect: true });
  expect(states.get(admin)).toMatchObject({ offeredChange: null, offersReconnect: false });
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
