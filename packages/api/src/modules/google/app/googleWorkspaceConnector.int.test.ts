import { ACME } from "@broccoli-access/fake-apps";
import { onTestFinished, vi } from "vitest";

import {
  GOOGLE_RELAY_URL,
  SHARED_GOOGLE_APP,
  SHARED_CLIENT_ID,
  GOOGLE_SCOPES,
  stubGoogleRelay,
  expect,
  test as baseTest,
  connectorContract,
  type ConnectorContractCase,
  googleScanSetup,
  storedAppConnections,
  TEST_SECRET_BOX,
  failFakeGoogle,
  createGoogleWorkspaceConnector,
  createAppConnectionService,
  startCountingGoogleProxy,
} from "#test/support";

import { ConnectorError, type ImportedAccount } from "../../../core/connectors";

const test = baseTest.extend<{ connectorCase: ConnectorContractCase }>({
  connectorCase: async ({ orm, fakeGoogle }, use) => {
    const { connectionId } = await googleScanSetup(orm, fakeGoogle.url);
    const [connection] = await storedAppConnections(orm);
    await use({
      connector: createGoogleWorkspaceConnector({
        openIdConfigurationUrl: `${fakeGoogle.url}/.well-known/openid-configuration`,
        adminApiUrl: fakeGoogle.url,
      }),
      connection: {
        settings: connection!.settings,
        secrets: await createAppConnectionService({ secretBox: TEST_SECRET_BOX }).readSecrets(
          orm,
          connectionId,
        ),
      },
      failAccounts: (error) =>
        failFakeGoogle(fakeGoogle.url, {
          endpoint: "directory.users.list",
          error,
          count: 1,
        }),
      revokeRefreshTokens: async () => {
        const response = await fetch(`${fakeGoogle.url}/_fake/tokens/revoke`, { method: "POST" });
        expect(response.status).toBe(204);
      },
      expireAccessTokens: async () => {
        const response = await fetch(`${fakeGoogle.url}/_fake/tokens/expire`, { method: "POST" });
        expect(response.status).toBe(204);
      },
    });
  },
});

connectorContract(test, {
  description: {
    key: "google_workspace",
    version: 1,
    name: "Google Workspace",
    capabilities: ["list_accounts"],
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

test("maps all 42 Google directory users to their own app's accounts", async ({
  connectorCase,
}) => {
  const session = await connectorCase.connector.openSession(connectorCase.connection);

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
        status: person.suspended ? "suspended" : "active",
        firstName: person.givenName,
        lastName: person.familyName,
        managerEmail: person.managerEmail,
        appName: "Google Workspace",
        isConnectionUser: false,
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
