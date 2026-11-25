import type { ConnectionSignInRequest } from "@broccoli-access/connector-contract";
import { ACME_SLACK } from "@broccoli-access/fake-apps";
import express from "express";

import {
  expect,
  test,
  OWNER,
  connectAsIntegrationUser,
  containerConnections,
  inviteIntegrationUserToFakeSlack,
  postFakeControl,
  readyIntegrationUser,
  serveConnectorRoutes,
  storedAppConnections,
} from "#test/support";

test("sends the stored Slack workspace only when signing in to an existing connection", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const workspaces: ConnectionSignInRequest["connection"][] = [];
  const proxy = express();
  proxy.post("/v1/connections/sign-in", express.json(), (req, _res, next) => {
    workspaces.push((req.body as ConnectionSignInRequest).connection);
    next();
  });
  const server = await serveConnectorRoutes(fakeConnectors.url, proxy);
  const { service } = await readyIntegrationUser(orm, seed, { ...fakeConnectors, url: server.url });
  await inviteIntegrationUserToFakeSlack(fakeConnectors, "admin");
  await connectAsIntegrationUser(service);

  await service.connectWithIntegrationUser(OWNER, SLACK);

  expect(workspaces).toMatchObject([null, { settings: ACME_SLACK.settings }]);
});

test("refuses an integration user that Slack has not invited, saying so", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const { service, sent } = await readyIntegrationUser(orm, seed, fakeConnectors);

  await expect(service.connectWithIntegrationUser(OWNER, SLACK)).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "integrationUser", code: "not_invited" }],
  });
  expect(await storedAppConnections(orm)).toEqual([]);
  expect(sent).toEqual([]);
});

test("refuses an integration user that is not an admin in Slack, saying so", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const { service } = await readyIntegrationUser(orm, seed, fakeConnectors);
  await inviteIntegrationUserToFakeSlack(fakeConnectors);

  await expect(service.connectWithIntegrationUser(OWNER, SLACK)).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "integrationUser", code: "permission_missing" }],
  });
  expect(await storedAppConnections(orm)).toEqual([]);
});

test.for(["blocked_by_check", "authentication_failed"] as const)(
  "refuses a sign-in that ends with %s, saying so",
  async (code, { orm, seed, fakeConnectors }) => {
    const { service } = await readyIntegrationUser(orm, seed, fakeConnectors);
    await inviteIntegrationUserToFakeSlack(fakeConnectors, "admin");
    await postFakeControl(fakeConnectors.url, "failures", {
      connector: "slack",
      call: "connections/sign-in",
      code,
      count: 1,
    });

    await expect(service.connectWithIntegrationUser(OWNER, SLACK)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "integrationUser", code }],
    });
    expect(await storedAppConnections(orm)).toEqual([]);
  },
);

test("reports a sign-in the container cannot finish as unavailable", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const { service } = await readyIntegrationUser(orm, seed, fakeConnectors);
  await postFakeControl(fakeConnectors.url, "failures", {
    connector: "slack",
    call: "connections/sign-in",
    code: "unexpected_response",
    count: 1,
  });

  await expect(service.connectWithIntegrationUser(OWNER, SLACK)).rejects.toMatchObject({
    code: "UNAVAILABLE",
  });
});

test.for([
  { description: "missing", secrets: {} },
  { description: "empty", secrets: { appSession: { cookies: [], storage: {} } } },
])(
  "refuses to store a connection when the Slack app session is $description",
  async ({ secrets }, { orm, seed, fakeConnectors }) => {
    await readyIntegrationUser(orm, seed, fakeConnectors);
    const container = express();
    container.post("/v1/connections/sign-in", (_request, response) => {
      response.json({
        details: { organizationName: "Acme", domain: "acme.slack.com" },
        connection: {
          settings: { teamId: "T04ACME", teamDomain: "acme", teamName: "Acme" },
          secrets,
        },
      });
    });
    const server = await serveConnectorRoutes(fakeConnectors.url, container);
    const { service } = containerConnections(orm, server.url);

    await expect(service.connectWithIntegrationUser(OWNER, SLACK)).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
    expect(await storedAppConnections(orm)).toEqual([]);
  },
);

test.for(["rate_limited", "app_unavailable"] as const)(
  "returns the workspace on the third sign-in after two %s answers",
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

    expect(result).toMatchObject({ connection: null, handOver: { organizationName: "Acme" } });
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
