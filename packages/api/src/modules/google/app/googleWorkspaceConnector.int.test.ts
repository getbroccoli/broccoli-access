import { ACME } from "@broccoli-access/fake-apps";
import { onTestFinished } from "vitest";

import {
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
    transport: "api",
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
