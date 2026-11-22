import { ACME } from "@broccoli-access/fake-apps";

import {
  expect,
  test,
  googleScanSetup,
  storedAppConnections,
  TEST_SECRET_BOX,
} from "#test/support";

import { createAppConnectionService } from ".";

test("reads the client secret and refresh token stored by consent", async ({ orm, fakeGoogle }) => {
  const { connectionId } = await googleScanSetup(orm, fakeGoogle.url);
  const service = createAppConnectionService({ secretBox: TEST_SECRET_BOX });
  const [connection] = await storedAppConnections(orm);
  const stored = JSON.parse(
    TEST_SECRET_BOX.decrypt(connection!.encryptedSecrets, connectionId),
  ) as Record<string, string>;

  const secrets = await service.readSecrets(orm, connectionId);

  expect(secrets).toEqual({
    clientSecret: ACME.oauthClient.clientSecret,
    refreshToken: stored.refreshToken,
  });
  expect(secrets?.refreshToken).toEqual(expect.any(String));
  expect(secrets?.refreshToken).not.toBe("");
});

test("returns no secrets for an unknown connection", async ({ orm }) => {
  const service = createAppConnectionService({ secretBox: TEST_SECRET_BOX });

  expect(await service.readSecrets(orm, "00000000-0000-4000-8000-000000000001")).toBeNull();
});
