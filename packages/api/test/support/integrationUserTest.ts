import type { Orm } from "../../src/core/db";
import { test } from "./fixture";
import { consentAtGoogle, registerGoogleRedirect } from "./googleConsent";
import { createdGoogleUsers } from "./fakeGoogleControls";
import { googleScanSetup } from "./googleScanSetup";
import { googleConnection, integrationUsers } from "./services";
import {
  connectionSecrets,
  storedIntegrationUsers,
  storedAppConnections,
} from "./storedGoogleConnection";

export const integrationUserTest = test.extend<{
  workspace: Awaited<ReturnType<typeof connectedWorkspace>>;
}>({
  workspace: async ({ orm, fakeGoogle }, use) => {
    await use(await connectedWorkspace(orm, fakeGoogle.url));
  },
});

export const CREATION_START = {
  email: "broccoli@acme.example",
  publicOrigin: "http://localhost:3000",
  now: new Date("2026-11-21T12:00:00Z"),
};

export async function consentAnswer(
  start: { authorizationUrl: string; browserToken: string },
  account = "admin@acme.example",
) {
  const callback = await consentAtGoogle(start.authorizationUrl, { account });
  return {
    publicOrigin: CREATION_START.publicOrigin,
    now: CREATION_START.now,
    browserToken: start.browserToken,
    code: callback.searchParams.get("code")!,
    state: callback.searchParams.get("state")!,
  };
}

async function connectedWorkspace(orm: Orm, googleUrl: string) {
  const { owner, connectionId } = await googleScanSetup(orm, googleUrl);
  const users = integrationUsers(orm, { googleUrl });
  return {
    owner,
    connectionId,
    users,
    allowCreation: async (email = CREATION_START.email, account?: string) =>
      consentAnswer(await users.startCreation(owner, { ...CREATION_START, email }), account),
    reconnect: async (client: { clientId: string; clientSecret: string }) => {
      const { publicOrigin, now } = CREATION_START;
      await registerGoogleRedirect(googleUrl, publicOrigin, client);
      const connection = googleConnection(orm, { googleUrl });
      const start = await connection.startAppChange(owner, { ...client, publicOrigin, now });
      await connection.finishAppChange(owner, await consentAnswer(start));
      const [reconnected] = await storedAppConnections(orm);
      return connectionSecrets(reconnected!).refreshToken;
    },
    readState: async () => ({
      rows: await storedIntegrationUsers(orm),
      connections: await storedAppConnections(orm),
      created: await createdGoogleUsers(googleUrl),
    }),
  };
}
