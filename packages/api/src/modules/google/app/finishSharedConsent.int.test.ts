import { onTestFinished, vi } from "vitest";

import {
  expect,
  test,
  SETUP_HOLDER,
  googleSetup,
  googleConnection,
  recordTokenRequests,
  GOOGLE_SCOPES,
  RELAY_HANDLE,
  startSharedGoogleSetup,
  stubGoogleRelay,
  assertRelayRedemption,
  googleRelayGrant,
  instances,
  storedApps,
  storedAppConnections,
  storedGoogleAccounts,
  storedUsers,
  storedImportSources,
  TEST_SECRET_BOX,
} from "#test/support";

import { ApplicationError } from "../../../core/applicationError";
import { NotSuperAdminError } from "../domain";

test("redeems shared consent, makes the admin owner and queues the connection's first scan", async ({
  orm,
  fakeGoogle,
}) => {
  const { connection, input, authorization, state, sent } = await startSharedGoogleSetup(
    orm,
    fakeGoogle.url,
  );
  const relay = stubGoogleRelay();
  const grant = await googleRelayGrant(fakeGoogle.url, authorization);
  relay.redeem.mockReturnValueOnce(Response.json(grant));

  const { userId } = await connection.finishConsent(SETUP_HOLDER, {
    ...input,
    state,
    handle: RELAY_HANDLE,
  });

  expect(relay.requests).toHaveLength(1);
  expect(relay.requests[0]!.redirect).not.toBe("follow");
  await assertRelayRedemption(relay.requests[0]!, authorization);
  expect(await storedUsers(orm)).toMatchObject([{ id: userId, email: "admin@acme.example" }]);
  expect(await storedGoogleAccounts(orm)).toMatchObject([
    { userId, providerId: "google", idToken: null, refreshToken: null, accessToken: null },
  ]);
  expect(await instances.readInstance(orm)).toMatchObject({
    ownerUserId: userId,
    step: "scan",
    setupSession: null,
  });
  const saved = await storedAppConnections(orm);
  expect(saved).toHaveLength(1);
  const { id, encryptedSecrets, settings } = saved[0]!;
  expect(settings).toEqual({
    googleApp: "broccoli_google_app",
    clientId: grant.client_id,
    previousClientIds: [],
    domain: "acme.example",
    organizationName: "Acme",
    adminEmail: "admin@acme.example",
    grantedScopes: expect.arrayContaining(GOOGLE_SCOPES) as unknown,
  });
  expect(grant.refresh_token).toBeTruthy();
  expect(JSON.parse(TEST_SECRET_BOX.decrypt(encryptedSecrets, id))).toEqual({
    refreshToken: grant.refresh_token,
  });
  const sources = await storedImportSources(orm);
  expect(sources).toMatchObject([{ connectionId: id, status: "scanning" }]);
  expect(sent).toEqual([{ name: "imports.scanConnection", payload: { sourceId: sources[0]!.id } }]);
});

test("reports a removed relay before contacting Google for an outstanding shared consent", async ({
  orm,
  fakeGoogle,
}) => {
  const { input, state } = await startSharedGoogleSetup(orm, fakeGoogle.url);
  const connection = googleConnection(orm, { googleUrl: fakeGoogle.url });
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("Unexpected HTTP request"));
  onTestFinished(() => fetch.mockRestore());

  await expect(
    connection.finishConsent(SETUP_HOLDER, { ...input, state, handle: RELAY_HANDLE }),
  ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  expect(fetch).not.toHaveBeenCalled();
});

test.for([
  "invalid ID token",
  "wrong nonce",
  "wrong audience",
  "missing scope",
  "missing refresh token",
  "non-admin",
])("refuses a shared grant with %s before saving setup", async (problem, { orm, fakeGoogle }) => {
  const { connection, input, authorization, state, sent } = await startSharedGoogleSetup(
    orm,
    fakeGoogle.url,
  );
  const relay = stubGoogleRelay();
  const grant = await googleRelayGrant(fakeGoogle.url, authorization, {
    ...(problem === "wrong nonce" && { nonce: "other-acme-consent" }),
    ...(problem === "non-admin" && { account: "chloe@acme.example" }),
  });
  relay.redeem.mockReturnValueOnce(
    Response.json({
      ...grant,
      ...(problem === "invalid ID token" && {
        id_token: grant.id_token.replace(/\.[^.]+$/, ".invalid"),
      }),
      ...(problem === "wrong audience" && { client_id: "other-acme-client" }),
      ...(problem === "missing scope" && { scope: GOOGLE_SCOPES.slice(0, -1).join(" ") }),
      ...(problem === "missing refresh token" && { refresh_token: null }),
    }),
  );

  await expect(
    connection.finishConsent(SETUP_HOLDER, { ...input, state, handle: RELAY_HANDLE }),
  ).rejects.toBeInstanceOf(problem === "non-admin" ? NotSuperAdminError : ApplicationError);

  await assertRelayRedemption(relay.requests[0]!, authorization);
  expect(await instances.readInstance(orm)).toMatchObject({
    step: "connect_google",
    ownerUserId: null,
  });
  expect(await storedUsers(orm)).toEqual([]);
  expect(await storedGoogleAccounts(orm)).toEqual([]);
  expect(await storedApps(orm)).toEqual([]);
  expect(await storedAppConnections(orm)).toEqual([]);
  expect(await storedImportSources(orm)).toEqual([]);
  expect(sent).toEqual([]);
});

test.for(["another browser", "expired state", "direct code", "code and handle"])(
  "refuses shared setup with %s before exchanging tokens",
  async (problem, { orm, seed, fakeGoogle }) => {
    const { connection, input, state } = await startSharedGoogleSetup(orm, fakeGoogle.url);
    const setupToken = problem === "another browser" ? "second-acme-browser" : input.setupToken;
    await seed.setupSession({
      token: setupToken,
      expiresAt: new Date(input.now.getTime() + 60 * 60_000),
    });
    const requests = recordTokenRequests();

    await expect(
      connection.finishConsent(SETUP_HOLDER, {
        ...input,
        state,
        setupToken,
        ...(problem === "expired state" && { now: new Date(input.now.getTime() + 11 * 60_000) }),
        ...(problem !== "direct code" && { handle: RELAY_HANDLE }),
        ...(["direct code", "code and handle"].includes(problem) && { code: "acme-code" }),
      }),
    ).rejects.toBeInstanceOf(ApplicationError);

    expect(requests).toEqual([]);
  },
);

test.for(["handle", "code and handle"])(
  "refuses %s for own-app consent before exchanging tokens",
  async (problem, { orm, fakeGoogle }) => {
    const { connection, input } = await googleSetup(orm, fakeGoogle.url);
    const { authorizationUrl } = await connection.startConnection(SETUP_HOLDER, input);
    const state = new URL(authorizationUrl).searchParams.get("state")!;
    const requests = recordTokenRequests();

    await expect(
      connection.finishConsent(SETUP_HOLDER, {
        ...input,
        state,
        handle: RELAY_HANDLE,
        ...(problem === "code and handle" && { code: "acme-code" }),
      }),
    ).rejects.toBeInstanceOf(ApplicationError);

    expect(requests).toEqual([]);
  },
);
