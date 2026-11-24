import express from "express";
import { CONNECTOR_MANIFEST } from "@broccoli-access/connector-contract";

import {
  accountChanges as accountChangeService,
  expect,
  inviteTest as test,
  linearInvitations,
  recordingJobQueue,
  serveConnectorRoutes,
  SYSTEM,
} from "#test/support";
import { accountChanges } from "../db";

test("refuses to queue an invite while Ivan's templates disagree on his role", async ({
  workspace: { assignLinearRole, owner, input, service, sent },
  orm,
}) => {
  await assignLinearRole("admin");
  await assignLinearRole(null);

  await expect(service.inviteEmployee(owner, input)).rejects.toMatchObject({ code: "CONFLICT" });
  expect(sent).toEqual([]);
  expect(await orm.select().from(accountChanges)).toEqual([]);
});

test.for(["one template", "the owner's pick"] as const)(
  "sends the queued admin role from %s even after Ivan loses the granting template",
  async (
    source,
    {
      workspace: { assignLinearRole, templates, owner, input, service, ivan },
      orm,
      fakeConnectors,
      seed,
    },
  ) => {
    if (source === "the owner's pick") await assignLinearRole("guest");
    const { id } = await assignLinearRole("admin");
    if (source === "the owner's pick") {
      await seed.employeeAppChoice({ ...input, choice: "role_picked", role: "admin" });
    }
    const { latestInvite } = await service.inviteEmployee(owner, input);
    expect
      .soft(await orm.select().from(accountChanges))
      .toMatchObject([{ id: latestInvite!.id, role: "admin" }]);
    await templates.takeOff(owner, { id, employeeId: ivan.id });

    await service.runChange(SYSTEM, latestInvite!.id);

    expect(await linearInvitations(fakeConnectors.url, ivan.email)).toMatchObject([
      { role: "admin" },
    ]);
  },
);

test.for(["the default role", "no manifest roles"])(
  "omits the role from the connector request for %s",
  async (
    scenario,
    { workspace: { assignLinearRole, owner, input, ivan }, fakeConnectors, orm },
  ) => {
    await assignLinearRole(null);
    const app = express();
    const accounts: unknown[] = [];
    app.post("/v1/actions/run", express.json(), (request, _response, next) => {
      accounts.push((request.body as { account: unknown }).account);
      next();
    });
    const server =
      scenario === "no manifest roles"
        ? await linearWithoutRoles(fakeConnectors.url, app)
        : await serveConnectorRoutes(fakeConnectors.url, app);
    const service = accountChangeService(orm, { connectorsUrl: server.url });
    const { latestInvite } = await service.inviteEmployee(owner, input);

    await service.runChange(SYSTEM, latestInvite!.id);

    expect(accounts).toEqual([{ email: ivan.email }]);
    expect(await linearInvitations(fakeConnectors.url, ivan.email)).toMatchObject([
      { role: "user" },
    ]);
  },
);

test("refuses a retired template role before queuing an invite", async ({
  workspace: { owner, input, assignLinearRole },
  orm,
  fakeConnectors,
}) => {
  await assignLinearRole("admin");
  const server = await linearWithoutRoles(fakeConnectors.url);
  const { jobs, sent } = recordingJobQueue();
  const service = accountChangeService(orm, { connectorsUrl: server.url, jobs });

  await expect(service.inviteEmployee(owner, input)).rejects.toMatchObject({
    code: "CONFLICT",
  });
  expect(sent).toEqual([]);
  expect(await orm.select().from(accountChanges)).toEqual([]);
});

test("a queued invite fails without an attempt when Linear stops listing roles", async ({
  workspace: { owner, input, assignLinearRole, service, ivan },
  orm,
  fakeConnectors,
}) => {
  await assignLinearRole("admin");
  const { latestInvite } = await service.inviteEmployee(owner, input);
  const server = await linearWithoutRoles(fakeConnectors.url);
  const worker = accountChangeService(orm, { connectorsUrl: server.url });

  await worker.runChange(SYSTEM, latestInvite!.id);

  expect(await service.readAppInvites(owner, [ivan.id])).toMatchObject([
    { latestInvite: { id: latestInvite!.id, status: "failed", attempts: [] } },
  ]);
  expect(await linearInvitations(fakeConnectors.url, ivan.email)).toEqual([]);
});

async function linearWithoutRoles(url: string, app = express()) {
  const response = await fetch(url + "/v1/connectors");
  const manifest = CONNECTOR_MANIFEST.parse(await response.json());
  delete manifest.connectors.find(({ key }) => key === "linear")!.roles;
  app.get("/v1/connectors", (_request, response) => response.json(manifest));
  return serveConnectorRoutes(url, app);
}
