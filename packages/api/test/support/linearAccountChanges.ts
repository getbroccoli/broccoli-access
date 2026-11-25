import { expect } from "vitest";

import type { Browser } from "./browser";
import { LINEAR_INPUT } from "./containerConnections";
import { finishSetupWithDemoApps } from "./scannedGoogle";
import type { TestEnv } from "./testEnv";

interface AppUser {
  id: string;
  employee: { email: string };
  status: string;
  isConnectionUser: boolean;
  offeredChange: string | null;
  latestChange: {
    id: string;
    action: string;
    status: string;
    changesAhead: number | null;
    finishedAt: string | null;
  } | null;
}

export const ACCOUNT_CHANGE_POLL = { timeout: 30_000, interval: 250 };
const USER_FIELDS = `id employee { email } status isConnectionUser offeredChange
  latestChange { id action status changesAhead finishedAt }`;
export const CHANGE_ACCOUNT = `mutation ($input: AppUserChangeInput!) {
  apps { changeAccount(input: $input) { appUser { ${USER_FIELDS} } error { __typename } } }
}`;

export async function connectedLinear(env: TestEnv) {
  const { browser, user: owner } = await env.signInAsOwner();
  await finishSetupWithDemoApps(browser);
  const response = await browser.graphql(
    `mutation ($input: ContainerConnectorConnectInput!) {
    connectors { connect(input: $input) { containerConnector { id } error { __typename } } }
  }`,
    { input: LINEAR_INPUT },
  );
  expect(await response.json()).toEqual({
    data: { connectors: { connect: { containerConnector: { id: "linear" }, error: null } } },
  });
  const apps = await browser.graphql(
    "{ apps(status: APPROVED) { edges { node { id catalogKey } } } }",
  );
  const body = (await apps.json()) as {
    data: { apps: { edges: { node: { id: string; catalogKey: string | null } }[] } };
  };
  const appId = body.data.apps.edges.find(({ node }) => node.catalogKey === "linear")!.node.id;
  await expect
    .poll(async () => {
      const result = await browser.graphql("query ($id: ID!) { app(id: $id) { users { id } } }", {
        id: appId,
      });
      const read = (await result.json()) as { data: { app: { users: unknown[] } } };
      return read.data.app.users.length;
    }, ACCOUNT_CHANGE_POLL)
    .toBe(7);
  return { browser, appId, owner };
}

export async function linearUsers(browser: Browser, appId: string) {
  const response = await browser.graphql(
    `query ($id: ID!) { app(id: $id) { canChangeAccounts users { ${USER_FIELDS} } } }`,
    { id: appId },
  );
  const body = (await response.json()) as {
    data: { app: { canChangeAccounts: boolean; users: AppUser[] } };
  };
  expect(body).not.toHaveProperty("errors");
  expect(body.data.app.canChangeAccounts).toBe(true);
  return body.data.app.users;
}

export async function changeAccount(
  browser: Browser,
  id: string,
  action: "SUSPEND" | "REACTIVATE",
) {
  const response = await browser.graphql(CHANGE_ACCOUNT, { input: { id, action } });
  const body = (await response.json()) as {
    data: { apps: { changeAccount: { appUser: AppUser; error: unknown } } };
  };
  expect(body).not.toHaveProperty("errors");
  expect(body.data.apps.changeAccount.error).toBeNull();
  return body.data.apps.changeAccount.appUser;
}
