import { ACME } from "@broccoli-access/fake-apps";

import {
  expect,
  test,
  SETUP_HOLDER,
  googleSetup,
  GOOGLE_SCOPES,
  consentAtGoogle,
  instances,
  storedApps,
  storedAppConnections,
  storedGoogleAccounts,
  storedUsers,
  TEST_SECRET_BOX,
  recordingJobQueue,
  storedImportSources,
} from "#test/support";

import { ApplicationError } from "../../../core/applicationError";
import type { Orm } from "../../../core/db";
import { NotSuperAdminError } from "../domain";

test("the consenting super admin becomes the owner with a Google account and setup advances to scan", async ({
  orm,
  fakeGoogle,
}) => {
  const { connection, input } = await googleSetup(orm, fakeGoogle.url);
  const { authorizationUrl } = await connection.startConnection(SETUP_HOLDER, input);
  const callback = await consentAtGoogle(authorizationUrl);

  const { userId } = await connection.finishConsent(SETUP_HOLDER, {
    ...input,
    code: callback.searchParams.get("code")!,
    state: callback.searchParams.get("state")!,
  });

  expect(await storedUsers(orm)).toMatchObject([{ id: userId, email: "admin@acme.example" }]);
  expect(await storedGoogleAccounts(orm)).toMatchObject([
    {
      userId,
      providerId: "google",
      accountId: ACME.people.find(({ email }) => email === "admin@acme.example")!.id,
      accessToken: null,
      refreshToken: null,
      idToken: null,
      password: null,
    },
  ]);
  expect(await instances.readInstance(orm)).toMatchObject({
    ownerUserId: userId,
    step: "scan",
    setupSession: null,
  });
});

test("stores connection settings separately from secrets encrypted for this connection", async ({
  orm,
  fakeGoogle,
}) => {
  const { connection, input } = await googleSetup(orm, fakeGoogle.url);
  const { authorizationUrl } = await connection.startConnection(SETUP_HOLDER, input);
  const callback = await consentAtGoogle(authorizationUrl);

  await connection.finishConsent(SETUP_HOLDER, {
    ...input,
    code: callback.searchParams.get("code")!,
    state: callback.searchParams.get("state")!,
  });

  const rows = await storedAppConnections(orm);
  expect(rows).toHaveLength(1);
  const saved = rows[0]!;
  const { grantedScopes, ...settings } = saved.settings;
  expect(settings).toEqual({
    googleApp: "own_google_app",
    clientId: input.clientId,
    domain: "acme.example",
    organizationName: "Acme",
    adminEmail: "admin@acme.example",
  });
  expect(grantedScopes).toEqual(expect.arrayContaining(GOOGLE_SCOPES));
  const secrets = JSON.parse(TEST_SECRET_BOX.decrypt(saved.encryptedSecrets, saved.id)) as Record<
    string,
    string
  >;
  expect(secrets.refreshToken).toEqual(expect.any(String));
  expect(secrets).toEqual({ clientSecret: input.clientSecret, refreshToken: secrets.refreshToken });
  expect(secrets.refreshToken).toBeTruthy();
  expect(() => TEST_SECRET_BOX.decrypt(saved.encryptedSecrets, "another-connection")).toThrow();
  expect(JSON.stringify(saved.settings)).not.toContain(input.clientSecret);
  expect(JSON.stringify(saved.settings)).not.toContain(secrets.refreshToken);
});

test("accepts Google's full names for the email and profile scopes", async ({
  orm,
  fakeGoogle,
}) => {
  const { connection, input } = await googleSetup(orm, fakeGoogle.url);
  const { authorizationUrl } = await connection.startConnection(SETUP_HOLDER, input);
  const url = new URL(authorizationUrl);
  url.searchParams.set(
    "scope",
    `openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile ${GOOGLE_SCOPES.slice(3).join(" ")}`,
  );
  const callback = await consentAtGoogle(url);

  await connection.finishConsent(SETUP_HOLDER, {
    ...input,
    code: callback.searchParams.get("code")!,
    state: callback.searchParams.get("state")!,
  });

  const [saved] = await storedAppConnections(orm);
  expect(saved?.settings.grantedScopes).toEqual(expect.arrayContaining(GOOGLE_SCOPES));
});

test("refuses a non-admin consent without writing anything", async ({ orm, fakeGoogle }) => {
  const { jobs, sent } = recordingJobQueue();
  const { connection, input } = await googleSetup(orm, fakeGoogle.url, jobs);
  const { authorizationUrl } = await connection.startConnection(SETUP_HOLDER, input);
  const callback = await consentAtGoogle(authorizationUrl, { account: "chloe@acme.example" });

  await expect(
    connection.finishConsent(SETUP_HOLDER, {
      ...input,
      code: callback.searchParams.get("code")!,
      state: callback.searchParams.get("state")!,
    }),
  ).rejects.toBeInstanceOf(NotSuperAdminError);

  await expectUnconnected(orm);
  expect(await storedImportSources(orm)).toEqual([]);
  expect(sent).toEqual([]);
});

test("consent creates a scanning source and queues its first scan", async ({ orm, fakeGoogle }) => {
  const { jobs, sent } = recordingJobQueue();
  const { connection, input } = await googleSetup(orm, fakeGoogle.url, jobs);
  const { authorizationUrl } = await connection.startConnection(SETUP_HOLDER, input);
  const callback = await consentAtGoogle(authorizationUrl);

  await connection.finishConsent(SETUP_HOLDER, {
    ...input,
    code: callback.searchParams.get("code")!,
    state: callback.searchParams.get("state")!,
  });

  const [saved] = await storedAppConnections(orm);
  const sources = await storedImportSources(orm);
  expect(sources).toMatchObject([
    {
      kind: "app_connection",
      connectionId: saved!.id,
      name: "acme.example",
      status: "scanning",
      failure: null,
      readAt: null,
    },
  ]);
  expect(sent).toEqual([{ name: "imports.scanConnection", payload: { sourceId: sources[0]!.id } }]);
});

test("refuses consent without a refresh token without writing anything", async ({
  orm,
  fakeGoogle,
}) => {
  const { connection, input } = await googleSetup(orm, fakeGoogle.url);
  const { authorizationUrl } = await connection.startConnection(SETUP_HOLDER, input);
  const url = new URL(authorizationUrl);
  url.searchParams.delete("access_type");
  const callback = await consentAtGoogle(url);

  await expect(
    connection.finishConsent(SETUP_HOLDER, {
      ...input,
      code: callback.searchParams.get("code")!,
      state: callback.searchParams.get("state")!,
    }),
  ).rejects.toBeInstanceOf(ApplicationError);

  await expectUnconnected(orm);
});

test("refuses consent missing a requested scope without writing anything", async ({
  orm,
  fakeGoogle,
}) => {
  const { connection, input } = await googleSetup(orm, fakeGoogle.url);
  const { authorizationUrl } = await connection.startConnection(SETUP_HOLDER, input);
  const url = new URL(authorizationUrl);
  url.searchParams.set("scope", GOOGLE_SCOPES.slice(0, -1).join(" "));
  const callback = await consentAtGoogle(url);

  await expect(
    connection.finishConsent(SETUP_HOLDER, {
      ...input,
      code: callback.searchParams.get("code")!,
      state: callback.searchParams.get("state")!,
    }),
  ).rejects.toBeInstanceOf(ApplicationError);

  await expectUnconnected(orm);
});

test("refuses an ID token for another nonce without writing anything", async ({
  orm,
  fakeGoogle,
}) => {
  const { connection, input } = await googleSetup(orm, fakeGoogle.url);
  const { authorizationUrl } = await connection.startConnection(SETUP_HOLDER, input);
  const url = new URL(authorizationUrl);
  url.searchParams.set("nonce", "another-nonce");
  const callback = await consentAtGoogle(url);

  await expect(
    connection.finishConsent(SETUP_HOLDER, {
      ...input,
      code: callback.searchParams.get("code")!,
      state: callback.searchParams.get("state")!,
    }),
  ).rejects.toBeInstanceOf(ApplicationError);

  await expectUnconnected(orm);
});

test("refuses a tampered state without writing anything", async ({ orm, fakeGoogle }) => {
  const { connection, input } = await googleSetup(orm, fakeGoogle.url);
  const { authorizationUrl } = await connection.startConnection(SETUP_HOLDER, input);
  const callback = await consentAtGoogle(authorizationUrl);
  const state = callback.searchParams.get("state")!;
  const tampered = `${state[0] === "A" ? "B" : "A"}${state.slice(1)}`;

  await expect(
    connection.finishConsent(SETUP_HOLDER, {
      ...input,
      code: callback.searchParams.get("code")!,
      state: tampered,
    }),
  ).rejects.toBeInstanceOf(ApplicationError);

  await expectUnconnected(orm);
});

test("refuses an expired state without writing anything", async ({ orm, fakeGoogle }) => {
  const { connection, input } = await googleSetup(orm, fakeGoogle.url);
  const { authorizationUrl } = await connection.startConnection(SETUP_HOLDER, input);
  const callback = await consentAtGoogle(authorizationUrl);

  await expect(
    connection.finishConsent(SETUP_HOLDER, {
      ...input,
      code: callback.searchParams.get("code")!,
      state: callback.searchParams.get("state")!,
      now: new Date(input.now.getTime() + 11 * 60_000),
    }),
  ).rejects.toBeInstanceOf(ApplicationError);

  await expectUnconnected(orm);
});

test("refuses another browser's state without writing anything", async ({
  orm,
  seed,
  fakeGoogle,
}) => {
  const { connection, input } = await googleSetup(orm, fakeGoogle.url);
  const { authorizationUrl } = await connection.startConnection(SETUP_HOLDER, input);
  const callback = await consentAtGoogle(authorizationUrl);

  await seed.setupSession({
    token: "another-browser",
    expiresAt: new Date("2026-11-24T12:00:00Z"),
  });

  await expect(
    connection.finishConsent(SETUP_HOLDER, {
      ...input,
      code: callback.searchParams.get("code")!,
      state: callback.searchParams.get("state")!,
      setupToken: "another-browser",
    }),
  ).rejects.toBeInstanceOf(ApplicationError);

  await expectUnconnected(orm);
});

test("refuses reused state without changing the successful connection", async ({
  orm,
  fakeGoogle,
}) => {
  const { connection, input } = await googleSetup(orm, fakeGoogle.url);
  const { authorizationUrl } = await connection.startConnection(SETUP_HOLDER, input);
  const callback = await consentAtGoogle(authorizationUrl);
  const finish = {
    ...input,
    code: callback.searchParams.get("code")!,
    state: callback.searchParams.get("state")!,
  };
  await connection.finishConsent(SETUP_HOLDER, finish);
  const before = {
    instance: await instances.readInstance(orm),
    users: await storedUsers(orm),
    accounts: await storedGoogleAccounts(orm),
    apps: await storedApps(orm),
    connections: await storedAppConnections(orm),
  };

  await expect(connection.finishConsent(SETUP_HOLDER, finish)).rejects.toBeInstanceOf(
    ApplicationError,
  );

  expect({
    instance: await instances.readInstance(orm),
    users: await storedUsers(orm),
    accounts: await storedGoogleAccounts(orm),
    apps: await storedApps(orm),
    connections: await storedAppConnections(orm),
  }).toEqual(before);
});

async function expectUnconnected(orm: Orm): Promise<void> {
  expect(await storedUsers(orm)).toEqual([]);
  expect(await storedGoogleAccounts(orm)).toEqual([]);
  expect(await storedApps(orm)).toEqual([]);
  expect(await storedAppConnections(orm)).toEqual([]);
  expect(await instances.readInstance(orm)).toMatchObject({
    ownerUserId: null,
    step: "connect_google",
  });
}
