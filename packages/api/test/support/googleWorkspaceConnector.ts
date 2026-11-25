import assert from "node:assert/strict";

import type { Orm } from "../../src/core/db";
import type { SecurityContext } from "../../src/core/security";
import { createGoogleClient } from "../../src/integrations/google";
import { createAppConnectionService } from "../../src/modules/apps";
import { createGoogleWorkspaceConnector } from "../../src/modules/google";
import type { ConnectorContractCase } from "./connectorContract";
import { failFakeGoogle } from "./fakeGoogleControls";
import { expect } from "vitest";
import { test } from "./fixture";
import { googleScanSetup } from "./googleScanSetup";
import { TEST_SECRET_BOX } from "./testSecretBox";
import { consentAnswer, CREATION_START } from "./integrationUserTest";
import { refreshGoogleGrant } from "./googleConsent";
import { integrationUsers } from "./services";
import { connectionSecrets, storedAppConnections } from "./storedGoogleConnection";

export const googleConnectorTest = test.extend<{ connectorCase: ConnectorContractCase }>({
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

/** Uses the existing integration-user consent to give the fake's directory a writable connection. */
export async function writableGoogleConnection(
  orm: Orm,
  googleUrl: string,
  owner: SecurityContext,
) {
  const users = integrationUsers(orm, { googleUrl });
  const start = await users.startCreation(owner, CREATION_START);
  await users.finishCreation(owner, await consentAnswer(start));
  const row = (await storedAppConnections(orm)).find(
    ({ connector }) => connector === "google_workspace",
  );
  assert(row);
  return { settings: row.settings, secrets: connectionSecrets(row) };
}

/** Reads the user's current status from the fake directory independently of the local account. */
export async function googleUserSuspended(
  googleUrl: string,
  secrets: { clientSecret: string; refreshToken: string },
  sourceKey: string,
) {
  const token = await refreshGoogleGrant(googleUrl, secrets);
  const directory = createGoogleClient({
    openIdConfigurationUrl: `${googleUrl}/.well-known/openid-configuration`,
    adminApiUrl: googleUrl,
  });
  const user = await directory.findUser(token.access_token, sourceKey);
  assert(user);
  return user.suspended;
}
