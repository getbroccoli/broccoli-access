import { ACME } from "@broccoli-access/fake-apps";
import { onTestFinished, vi } from "vitest";

import {
  GOOGLE_RELAY_URL,
  SHARED_GOOGLE_APP,
  SHARED_CLIENT_ID,
  GOOGLE_SCOPES,
  stubGoogleRelay,
  expect,
  googleConnectorTest as test,
  connectorContract,
  googleScanSetup,
  googleUserSuspended,
  writableGoogleConnection,
  failFakeGoogle,
  createGoogleWorkspaceConnector,
  startCountingGoogleProxy,
} from "#test/support";

import type { Orm } from "../../../core/db";
import { ConnectorError, type ImportedAccount } from "../../../core/connectors";

connectorContract(test, {
  description: {
    key: "google_workspace",
    version: 1,
    name: "Google Workspace",
    capabilities: ["list_accounts", "suspend", "reactivate", "invite"],
    runtimes: ["server"],
    findingKinds: { ownAppAccounts: "google_directory", otherAppAccounts: "google_sign_in" },
    isDirectory: true,
    connectionFields: [
      { key: "clientId", secret: false },
      { key: "clientSecret", secret: true },
      { key: "refreshToken", secret: true },
    ],
  },
  connection: { domain: "acme.example", organizationName: "Acme" },
});

test("suspends a directory user and restores them in Google Workspace", async ({
  orm,
  fakeGoogle,
}) => {
  const { session, secrets } = await writableSession(orm, fakeGoogle.url);
  const account = directoryAccount("chloe@acme.example");

  expect(await session.runAction!("suspend", account)).toEqual({ status: "suspended" });
  expect(await googleUserSuspended(fakeGoogle.url, secrets, account.sourceKey)).toBe(true);

  expect(await session.runAction!("reactivate", account)).toEqual({ status: "active" });
  expect(await googleUserSuspended(fakeGoogle.url, secrets, account.sourceKey)).toBe(false);
});

test("refuses to suspend its connection admin", async ({ orm, fakeGoogle }) => {
  const { session, secrets } = await writableSession(orm, fakeGoogle.url);
  const admin = directoryAccount("admin@acme.example");

  const result = session.runAction!("suspend", { ...admin, email: admin.email.toUpperCase() });

  await expect(result).rejects.toBeInstanceOf(ConnectorError);
  await expect(result).rejects.toMatchObject({ code: "not_allowed" });
  expect(await googleUserSuspended(fakeGoogle.url, secrets, admin.sourceKey)).toBe(false);
});

test("reports missing permission when the grant allows only directory reads", async ({
  connectorCase,
}) => {
  const session = await connectorCase.connector.openSession(connectorCase.connection);
  const result = session.runAction!("suspend", directoryAccount("chloe@acme.example"));

  await expect(result).rejects.toBeInstanceOf(ConnectorError);
  await expect(result).rejects.toMatchObject({ code: "permission_missing" });
});

test("reports a directory user missing for an unknown source key", async ({ orm, fakeGoogle }) => {
  const { session } = await writableSession(orm, fakeGoogle.url);

  const result = session.runAction!("suspend", {
    ...directoryAccount("chloe@acme.example"),
    sourceKey: "unknown-user",
  });

  await expect(result).rejects.toBeInstanceOf(ConnectorError);
  await expect(result).rejects.toMatchObject({ code: "account_not_found" });
});

test("maps all 42 Google directory users to their own app's accounts", async ({
  connectorCase,
}) => {
  const session = await connectorCase.connector.openSession({
    ...connectorCase.connection,
    settings: {
      ...(connectorCase.connection.settings as Record<string, unknown>),
      adminEmail: "ADMIN@acme.example",
    },
  });

  const accounts: ImportedAccount[] = [];
  let cursor: string | null = null;
  do {
    const page = await session.listAccounts(cursor);
    accounts.push(...page.accounts.filter(({ values }) => values.appExternalId === null));
    cursor = page.nextCursor;
  } while (cursor !== null);

  expect(accounts).toHaveLength(42);
  for (const person of ACME.people) {
    const account = accounts.find(({ sourceKey }) => sourceKey === person.id);
    expect(account?.raw).toEqual({
      kind: "admin#directory#user",
      id: person.id,
      primaryEmail: person.email,
      name: {
        givenName: person.givenName,
        familyName: person.familyName,
        fullName: `${person.givenName} ${person.familyName}`,
      },
      isAdmin: person.isSuperAdmin,
      suspended: person.suspended,
      changePasswordAtNextLogin: false,
      orgUnitPath: "/",
      ...(person.managerEmail !== null && {
        relations: [{ value: person.managerEmail, type: "manager" }],
      }),
      customerId: ACME.customer.id,
      creationTime: person.creationTime,
      ...(person.photo !== null && { thumbnailPhotoEtag: expect.any(String) as unknown }),
    });
    expect(account).toMatchObject({
      values: {
        email: person.email,
        displayName: null,
        status: person.suspended ? "suspended" : "active",
        firstName: person.givenName,
        lastName: person.familyName,
        managerEmail: person.managerEmail,
        appName: "Google Workspace",
        isConnectionUser: person.email === "admin@acme.example",
        appExternalId: null,
        grantedAt: null,
        grantedBefore: null,
      },
    });
  }
});

test("maps every grant except the instance's own client to an app account", async ({
  connectorCase,
}) => {
  const openedAt = Date.now();
  const session = await connectorCase.connector.openSession(connectorCase.connection);
  const accounts: ImportedAccount[] = [];
  let cursor: string | null = null;

  do {
    const page = await session.listAccounts(cursor);
    accounts.push(...page.accounts.filter(({ values }) => values.appExternalId !== null));
    cursor = page.nextCursor;
  } while (cursor !== null);

  expect(accounts).toHaveLength(ACME.grants.length);
  expect(accounts.map(({ values }) => [values.email, values.appExternalId]).sort()).toEqual(
    ACME.grants.map(({ email, clientId }) => [email, `google:${clientId}`]).sort(),
  );
  const figma = ACME.apps.find(({ name }) => name === "Figma")!;
  const ana = accounts.find(
    ({ sourceKey }) => sourceKey === `104857392018374650123:${figma.clientId}`,
  )!;
  expect(ana).toEqual({
    sourceKey: `104857392018374650123:${figma.clientId}`,
    raw: {
      kind: "admin#directory#token",
      clientId: figma.clientId,
      displayText: "Figma",
      scopes: ["openid", "email", "profile"],
      userKey: "104857392018374650123",
      anonymous: false,
      nativeApp: false,
    },
    values: {
      email: "ana@acme.example",
      displayName: null,
      status: "active",
      firstName: null,
      lastName: null,
      managerEmail: null,
      appName: "Figma",
      isConnectionUser: false,
      appExternalId: `google:${figma.clientId}`,
      grantedAt: null,
      grantedBefore: expect.any(String) as unknown,
    },
  });
  const logStart = Date.parse(ana.values.grantedBefore!);
  expect(logStart).toBeGreaterThanOrEqual(openedAt - 180 * 86_400_000);
  expect(logStart).toBeLessThanOrEqual(Date.now() - 180 * 86_400_000);
});

test("a retried page reads only the tokens lists that failed", async ({
  connectorCase,
  fakeGoogle,
}) => {
  const proxy = await startCountingGoogleProxy(fakeGoogle.url);
  onTestFinished(() => proxy.stop());
  const connector = createGoogleWorkspaceConnector({
    openIdConfigurationUrl: `${fakeGoogle.url}/.well-known/openid-configuration`,
    adminApiUrl: proxy.url,
  });
  const session = await connector.openSession(connectorCase.connection);
  await failFakeGoogle(fakeGoogle.url, {
    endpoint: "directory.tokens.list",
    error: "rate_limited",
    count: 1,
  });

  const firstAttempt = session.listAccounts(null);
  await expect(firstAttempt).rejects.toBeInstanceOf(ConnectorError);
  await expect(firstAttempt).rejects.toMatchObject({ code: "rate_limited" });
  const page = await session.listAccounts(null);

  const users = page.accounts.filter(({ values }) => values.appExternalId === null);
  expect(users).toHaveLength(3);
  const tokenPaths = proxy.paths.filter((path) => path.endsWith("/tokens"));
  expect(tokenPaths).toHaveLength(4);
  const readsPerUser = users.map(
    ({ sourceKey }) =>
      tokenPaths.filter((path) => path === `/admin/directory/v1/users/${sourceKey}/tokens`).length,
  );
  expect(readsPerUser.sort()).toEqual([1, 1, 2]);
});

test.for([
  { failure: "invalid_grant", status: 400, expected: "authentication_failed" },
  { failure: "invalid_request", status: 400, expected: "unexpected_response" },
  { failure: "unrecognised body", status: 400, expected: "unexpected_response" },
  { failure: "proxy refused", status: 403, expected: "app_unavailable" },
  { failure: "route unavailable", status: 404, expected: "app_unavailable" },
  { failure: "oauth", status: 502, expected: "app_unavailable" },
  { failure: "network", status: 0, expected: "app_unavailable" },
])(
  "classifies shared refresh failure $failure as $expected",
  async ({ failure, status, expected }, { fakeGoogle }) => {
    const relay = stubGoogleRelay();
    relay.refresh.mockImplementation(() => {
      if (failure === "network") throw new TypeError("fetch failed");
      return failure === "unrecognised body"
        ? new Response("Bad request", { status })
        : Response.json({ ok: false, error: failure }, { status });
    });
    const connector = relayConnector(fakeGoogle.url);

    await expect(
      connector.openSession({
        settings: SHARED_SETTINGS,
        secrets: { refreshToken: "acme-refresh" },
      }),
    ).rejects.toMatchObject({ code: expected });

    expect(relay.requests.map(({ url }) => url)).toEqual([GOOGLE_RELAY_URL + "/google/refresh"]);
  },
);

test("refuses a redirect when refreshing shared credentials", async ({ fakeGoogle }) => {
  const relay = stubGoogleRelay();
  relay.refresh.mockReturnValueOnce(Response.redirect(GOOGLE_RELAY_URL + "/moved", 303));

  await expect(
    relayConnector(fakeGoogle.url).openSession({
      settings: SHARED_SETTINGS,
      secrets: { refreshToken: "acme-refresh" },
    }),
  ).rejects.toThrow();

  expect(relay.requests).toHaveLength(1);
  expect(relay.requests[0]!.redirect).not.toBe("follow");
});

test.for([
  { googleApp: "own_google_app", secrets: { refreshToken: "acme-refresh" } },
  {
    googleApp: "broccoli_google_app",
    secrets: { refreshToken: "acme-refresh", clientSecret: "acme-fixture" },
  },
])(
  "refuses incompatible secrets for $googleApp before any HTTP request",
  async ({ googleApp, secrets }, { fakeGoogle }) => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Unexpected HTTP request"));
    onTestFinished(() => fetch.mockRestore());
    const connector = relayConnector(fakeGoogle.url);

    await expect(
      connector.openSession({ settings: { ...SHARED_SETTINGS, googleApp }, secrets }),
    ).rejects.toThrow();

    expect(fetch).not.toHaveBeenCalled();
  },
);

const SHARED_SETTINGS = {
  ...SHARED_GOOGLE_APP,
  clientId: SHARED_CLIENT_ID,
  domain: "acme.example",
  organizationName: "Acme",
  adminEmail: "admin@acme.example",
  grantedScopes: GOOGLE_SCOPES,
  previousClientIds: [],
};

function relayConnector(googleUrl: string) {
  return createGoogleWorkspaceConnector({
    openIdConfigurationUrl: googleUrl + "/.well-known/openid-configuration",
    adminApiUrl: googleUrl,
    relayUrl: GOOGLE_RELAY_URL,
  });
}

async function writableSession(orm: Orm, url: string) {
  const { owner } = await googleScanSetup(orm, url);
  const connection = await writableGoogleConnection(orm, url, owner);
  const session = await relayConnector(url).openSession(connection);
  return { session, secrets: connection.secrets };
}

function directoryAccount(email: string) {
  const person = ACME.people.find((person) => person.email === email)!;
  return { sourceKey: person.id, email };
}
