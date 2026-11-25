import { ACTION_RUN_ANSWER, type ActionRunAnswer } from "@broccoli-access/connector-contract";
import { callConnector, NOTION_CONNECTION } from "@broccoli-access/fake-apps/test/support";
import express from "express";

import {
  accountChanges,
  appUsers,
  containerConnectors,
  expect,
  instantNotionInvite,
  scans,
  serveAccountList,
  serveConnectorRoutes,
  SYSTEM,
  test,
} from "#test/support";

test("a verified instant invite succeeds even when its connection turned to Reconnect during the call", async ({
  orm,
  fakeGoogle,
}) => {
  const { owner, input, ivan, changes, connectionId, sourceId, url } = await instantNotionInvite(
    orm,
    fakeGoogle.url,
  );
  const { latestInvite } = await changes.inviteEmployee(owner, input);
  const refused = await serveAccountList(url, (_request, response) =>
    response.json({ error: { code: "permission_missing" } }),
  );
  const scan = scans(orm, { connectors: containerConnectors(refused.url) });
  const proxy = await serveInviteAnswer(url, async (response, answer) => {
    await scan.scanNow(owner, connectionId);
    await scan.runScan(SYSTEM, sourceId);
    response.json(answer);
  });

  await accountChanges(orm, { connectorsUrl: proxy.url }).runChange(SYSTEM, latestInvite!.id);

  expect(
    (await changes.readConnectionStates(owner, [connectionId])).get(connectionId),
  ).toMatchObject({
    status: "reconnect",
  });
  expect.soft(await changes.readAccountChange(owner, latestInvite!.id)).toMatchObject({
    status: "succeeded",
    error: null,
  });
  expect(await appUsers(orm).readUsersOfEmployees(owner, [ivan.id])).toMatchObject([
    { ...input, email: ivan.email, status: "active", inApp: true },
  ]);
});

test("a retried instant invite gives access when the first response was lost", async ({
  orm,
  fakeGoogle,
}) => {
  const { owner, input, ivan, changes, url } = await instantNotionInvite(orm, fakeGoogle.url);
  const { latestInvite } = await changes.inviteEmployee(owner, input);
  const answers: boolean[] = [];
  const proxy = await serveInviteAnswer(url, (response, answer) => {
    answers.push(answer.changed);
    if (answers.length === 1) response.destroy();
    else response.json(answer);
  });

  await accountChanges(orm, { connectorsUrl: proxy.url }).runChange(SYSTEM, latestInvite!.id);

  expect(answers).toEqual([true, false]);
  expect(await changes.readAccountChange(owner, latestInvite!.id)).toMatchObject({
    status: "succeeded",
  });
  expect(await appUsers(orm).readUsersOfEmployees(owner, [ivan.id])).toMatchObject([
    { ...input, email: ivan.email, status: "active", inApp: true },
  ]);
});

test.for([400, 404])(
  "an HTTP %i invite response does not grant access on retry",
  async (status, { orm, fakeGoogle }) => {
    const { owner, input, ivan, changes, url } = await instantNotionInvite(orm, fakeGoogle.url);
    const { body } = await callConnector(url, "actions/run", {
      connector: "notion",
      runtime: { kind: "server" },
      connection: NOTION_CONNECTION,
      action: "invite",
      account: { email: ivan.email },
    });
    expect(ACTION_RUN_ANSWER.parse(body)).toMatchObject({
      changed: true,
      account: { values: { email: ivan.email, status: "active" } },
    });
    const { latestInvite } = await changes.inviteEmployee(owner, input);
    let refused = false;
    const proxy = express();
    proxy.post("/v1/actions/run", (_request, response, next) => {
      if (refused) return next();
      refused = true;
      response.sendStatus(status);
    });
    const server = await serveConnectorRoutes(url, proxy);

    await accountChanges(orm, { connectorsUrl: server.url }).runChange(SYSTEM, latestInvite!.id);

    expect(await appUsers(orm).readUsersOfEmployees(owner, [ivan.id])).toEqual([]);
  },
);

test("a verified instant invite moves access when Notion reuses a listed member key for another email", async ({
  orm,
  fakeGoogle,
}) => {
  const oldEmail = "chloe@acme.example";
  const { owner, input, ivan, changes, appId } = await instantNotionInvite(orm, fakeGoogle.url, {
    replaceMemberOnInvite: oldEmail,
  });
  const users = appUsers(orm);
  const previous = (await users.readUsersOfApps(owner, [appId])).find(
    ({ email }) => email === oldEmail,
  );
  expect(previous).toMatchObject({ email: oldEmail, status: "active", inApp: true });
  const { latestInvite } = await changes.inviteEmployee(owner, input);

  await changes.runChange(SYSTEM, latestInvite!.id);

  expect(await changes.readAccountChange(owner, latestInvite!.id)).toMatchObject({
    status: "succeeded",
  });
  expect(
    await users.readUsersOfEmployees(owner, [ivan.id, previous!.employeeId], undefined, [appId]),
  ).toMatchObject([{ ...input, email: ivan.email, status: "active", inApp: true }]);
});

test("a reused member key leaves the old email suspended when only its suspended member remains", async ({
  orm,
  fakeGoogle,
}) => {
  const oldEmail = "chloe@acme.example";
  const { owner, input, ivan, changes, appId } = await instantNotionInvite(orm, fakeGoogle.url, {
    replaceMemberOnInvite: oldEmail,
    suspendedMemberEmail: oldEmail,
  });
  const users = appUsers(orm);
  const previous = (await users.readUsersOfApps(owner, [appId])).find(
    ({ email }) => email === oldEmail,
  );
  expect(previous).toMatchObject({ email: oldEmail, status: "active", inApp: true });
  const { latestInvite } = await changes.inviteEmployee(owner, input);

  await changes.runChange(SYSTEM, latestInvite!.id);

  expect(await users.readUsersOfEmployees(owner, [ivan.id], undefined, [appId])).toMatchObject([
    { ...input, email: ivan.email, status: "active", inApp: true },
  ]);
  expect(
    await users.readUsersOfEmployees(owner, [previous!.employeeId], undefined, [appId]),
  ).toMatchObject([{ id: previous!.id, email: oldEmail, status: "suspended", inApp: true }]);
});

function serveInviteAnswer(
  url: string,
  respond: (response: express.Response, answer: ActionRunAnswer) => void | Promise<void>,
) {
  const proxy = express();
  proxy.post("/v1/actions/run", express.json(), async (request, response) => {
    const upstream = await fetch(`${url}/v1/actions/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request.body),
    });
    await respond(response, ACTION_RUN_ANSWER.parse(await upstream.json()));
  });
  return serveConnectorRoutes(url, proxy);
}
