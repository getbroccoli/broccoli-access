import { ACME } from "@broccoli-access/fake-apps";

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
} from "#test/support";

import type { ImportedAccount } from "../../../core/connectors";

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
    accounts.push(...page.accounts);
    cursor = page.nextCursor;
  } while (cursor !== null);

  expect(accounts).toHaveLength(42);
  for (const person of ACME.people) {
    expect(accounts.find(({ sourceKey }) => sourceKey === person.id)).toMatchObject({
      raw: { id: person.id, primaryEmail: person.email, suspended: person.suspended },
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
