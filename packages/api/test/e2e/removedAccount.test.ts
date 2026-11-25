import express from "express";

import { expect, finishSetupWithPreselectedApps, serveConnectorRoutes, test } from "#test/support";

test("an unlinked row deleted during a People query still answers and is gone from the next", async ({
  env,
  fakeConnectors,
}) => {
  const { browser, user } = await env.signInAsOwner();
  await finishSetupWithPreselectedApps(browser);
  const app = await env.seed.app({ name: "Design", catalogKey: null, status: "approved" });
  const connection = await env.seed.appConnection({ appId: app.id, connector: "linear" });
  const account = await env.seed.appAccount({
    appId: app.id,
    status: "suspended",
    foundVia: ["linear_members"],
  });
  const change = await env.seed.accountChange({
    appId: app.id,
    connectionId: connection.id,
    appAccountId: account.id,
    email: account.email,
    requestedBy: user.id,
    requestedAt: new Date("2026-01-01"),
    action: "remove",
    status: "failed",
    error: "not_allowed",
  });
  const proxy = express();
  let removeDuringRead = false;
  proxy.get("/v1/connectors", async (_request, response, next) => {
    // A failed startup read makes the actions batch fetch the manifest after reading the row.
    if (!removeDuringRead) {
      response.sendStatus(503);
      return;
    }
    const done = await browser.graphql(
      `mutation ($id: ID!) {
      apps { markAccountChangeDoneByHand(input: {id: $id}) { error { __typename } } }
    }`,
      { id: change.id },
    );
    expect(await done.json()).toEqual({
      data: { apps: { markAccountChangeDoneByHand: { error: null } } },
    });
    next();
  });
  const server = await serveConnectorRoutes(fakeConnectors.url, proxy);
  await env.restart({ connectorsUrl: server.url });
  const listed = await browser.graphql("{ accountsWithoutPerson { edges { node { id } } } }");
  expect(await listed.json()).toMatchObject({
    data: { accountsWithoutPerson: { edges: [{ node: { id: account.id } }] } },
  });

  removeDuringRead = true;
  const response = await browser.graphql(
    "{ accountsWithoutPerson { edges { node { id offersRemove latestChange { id } } } } }",
  );

  // The row answers with what was read before the removal; the next read no longer lists it.
  expect(await response.json()).toEqual({
    data: {
      accountsWithoutPerson: {
        edges: [{ node: { id: account.id, offersRemove: false, latestChange: { id: change.id } } }],
      },
    },
  });
  const count = await browser.graphql("{ accountsWithoutPersonCount }");
  expect(await count.json()).toEqual({ data: { accountsWithoutPersonCount: 0 } });
}, 90_000);
