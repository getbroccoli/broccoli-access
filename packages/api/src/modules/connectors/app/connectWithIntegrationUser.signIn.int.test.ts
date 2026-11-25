import express from "express";

import {
  expect,
  test,
  OWNER,
  containerConnections,
  inviteIntegrationUserToFakeSlack,
  postFakeControl,
  readyIntegrationUser,
  serveConnectorRoutes,
  storedAppConnections,
} from "#test/support";

test("refuses a sign-in answer missing Slack's app session and stores no connection", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  await readyIntegrationUser(orm, seed, fakeConnectors);
  const container = express();
  container.post("/v1/connections/sign-in", (_request, response) => {
    response.json({
      details: { organizationName: "Acme", domain: "acme.slack.com" },
      connection: {
        settings: { teamId: "T04ACME", teamDomain: "acme", teamName: "Acme" },
        secrets: {},
      },
    });
  });
  const server = await serveConnectorRoutes(fakeConnectors.url, container);
  const { service } = containerConnections(orm, server.url);

  await expect(service.connectWithIntegrationUser(OWNER, SLACK)).rejects.toMatchObject({
    code: "UNAVAILABLE",
  });
  expect(await storedAppConnections(orm)).toEqual([]);
});

test.for(["rate_limited", "app_unavailable"] as const)(
  "connects on the third sign-in after two %s answers",
  async (code, { orm, seed, fakeConnectors }) => {
    const { service } = await readyIntegrationUser(orm, seed, fakeConnectors);
    await inviteIntegrationUserToFakeSlack(fakeConnectors, "admin");
    await postFakeControl(fakeConnectors.url, "failures", {
      connector: "slack",
      call: "connections/sign-in",
      code,
      count: 2,
    });

    const result = await service.connectWithIntegrationUser(OWNER, SLACK);

    expect(result.connection).toMatchObject({ sessionFrom: "server_sign_in" });
  },
);

test("gives up after three unavailable sign-ins and stores no connection", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  await readyIntegrationUser(orm, seed, fakeConnectors);
  await inviteIntegrationUserToFakeSlack(fakeConnectors, "admin");
  await postFakeControl(fakeConnectors.url, "failures", {
    connector: "slack",
    call: "connections/sign-in",
    code: "app_unavailable",
    count: 3,
  });
  let attempts = 0;
  const container = express();
  container.post("/v1/connections/sign-in", (_request, _response, next) => {
    attempts += 1;
    next();
  });
  const server = await serveConnectorRoutes(fakeConnectors.url, container);
  const { service } = containerConnections(orm, server.url);

  await expect(service.connectWithIntegrationUser(OWNER, SLACK)).rejects.toMatchObject({
    code: "UNAVAILABLE",
  });
  expect(await storedAppConnections(orm)).toEqual([]);
  expect(attempts).toBe(3);
});

const SLACK = { connector: "slack", noticeAccepted: true };
