import { ACME } from "@broccoli-access/fake-apps";

import {
  expect,
  test,
  SYSTEM,
  GOOGLE_RELAY_URL,
  SHARED_CLIENT_ID,
  SHARED_GOOGLE_APP,
  RELAY_HANDLE,
  googleRelayGrant,
  googleSignIn,
  recordTokenRequests,
  stubGoogleRelay,
  assertRelayRedemption,
  consentAtGoogle,
  connectedWorkspace,
  storedImportSources,
  storedWorkspace,
  storedAppConnections,
  storedAppAccounts,
  storedApps,
  TEST_SECRET_BOX,
  changeStoredGoogleDomain,
} from "#test/support";

import type { Orm } from "../../../core/db";
import { OtherWorkspaceError } from "../domain";
import { sealConsentState } from "../helpers";

test("switching from own to shared to own keeps the connection, workspace records and previous client IDs", async ({
  orm,
  fakeGoogle,
}) => {
  const change = await startSharedChange(orm, fakeGoogle.url);
  const { ctx, input, connection, connectionId } = change.workspace;
  const before = await storedWorkspace(orm);
  expect(before.people).toHaveLength(42);

  await connection.finishAppChange(ctx, change.answer);

  const [shared] = await storedAppConnections(orm);
  expect(shared).toMatchObject({
    id: connectionId,
    settings: {
      googleApp: "broccoli_google_app",
      clientId: SHARED_CLIENT_ID,
      previousClientIds: [ACME.oauthClient.clientId],
    },
  });
  expect(JSON.parse(TEST_SECRET_BOX.decrypt(shared!.encryptedSecrets, connectionId))).toEqual({
    refreshToken: change.grant.refresh_token,
  });
  expect(await storedWorkspace(orm)).toEqual(before);

  const { authorizationUrl, browserToken } = await connection.startAppChange(ctx, input);
  const callback = await consentAtGoogle(authorizationUrl);
  await connection.finishAppChange(ctx, {
    ...input,
    browserToken,
    state: callback.searchParams.get("state")!,
    code: callback.searchParams.get("code")!,
  });

  const saved = await storedAppConnections(orm);
  expect(saved).toMatchObject([
    {
      id: connectionId,
      settings: {
        googleApp: "own_google_app",
        clientId: input.clientId,
        previousClientIds: [ACME.oauthClient.clientId, SHARED_CLIENT_ID],
      },
    },
  ]);
  expect(JSON.parse(TEST_SECRET_BOX.decrypt(saved[0]!.encryptedSecrets, connectionId))).toEqual({
    clientSecret: input.clientSecret,
    refreshToken: expect.any(String) as unknown,
  });
  expect(await storedWorkspace(orm)).toEqual(before);
});

test.for(["?", "#"])(
  "a relay base ending in %s preserves its path for consent and scan refresh",
  async (delimiter, { orm, fakeGoogle }) => {
    const { workspace, grant, relay, answer, authorization } = await startSharedChange(
      orm,
      fakeGoogle.url,
      await connectedWorkspace(orm, fakeGoogle.url, GOOGLE_RELAY_URL + delimiter),
    );
    expect(authorization.origin + authorization.pathname).toBe(
      GOOGLE_RELAY_URL + "/google/authorize",
    );
    const { ctx, connectionId, scans, sourceId } = workspace;
    const apps = await storedApps(orm);
    const accounts = await storedAppAccounts(orm);
    await workspace.connection.finishAppChange(ctx, answer);
    await assertRelayRedemption(relay.requests[0]!, authorization);
    relay.refresh.mockImplementation(() =>
      Response.json({ ok: true, access_token: grant.access_token }),
    );

    await scans.scanNow(ctx, connectionId);
    await scans.runScan(SYSTEM, sourceId);

    const refresh = relay.requests[1]!;
    expect(refresh.url).toBe(GOOGLE_RELAY_URL + "/google/refresh");
    expect(refresh.method).toBe("POST");
    expect(refresh.headers.get("content-type")).toMatch(/^application\/json\b/i);
    expect(await refresh.json()).toEqual({ refresh_token: grant.refresh_token });
    expect(await storedImportSources(orm)).toMatchObject([{ status: "scanned", failure: null }]);
    expect(await storedApps(orm)).toEqual(apps);
    expect(await storedAppAccounts(orm)).toEqual(accounts);
  },
);

test("an owner switching a legacy own-app connection establishes the shared sign-in address", async ({
  orm,
  seed,
  fakeGoogle,
}) => {
  const workspace = await connectedWorkspace(orm, fakeGoogle.url, GOOGLE_RELAY_URL);
  await seed.clearPublicOrigin();
  const { now, publicOrigin } = workspace.input;
  const visitor = { now, publicOrigin: "https://alias.acme.example" };
  const signIn = googleSignIn(orm, { googleUrl: fakeGoogle.url, relayUrl: GOOGLE_RELAY_URL });
  await signIn.startSignIn(visitor);

  const change = await startSharedChange(orm, fakeGoogle.url, workspace);
  await workspace.connection.finishAppChange(workspace.ctx, {
    ...change.answer,
    publicOrigin: visitor.publicOrigin,
  });
  await assertRelayRedemption(change.relay.requests[0]!, change.authorization);

  const { authorizationUrl } = await signIn.startSignIn(visitor);
  expect(new URL(authorizationUrl).searchParams.get("return_to")).toBe(
    publicOrigin + "/api/google/callback",
  );
});

test("a shared app grant from another workspace keeps the original connection", async ({
  orm,
  fakeGoogle,
}) => {
  const workspace = await connectedWorkspace(orm, fakeGoogle.url, GOOGLE_RELAY_URL);
  const { ctx, connection, connectionId } = workspace;
  await changeStoredGoogleDomain(orm, connectionId, "other.acme.example");
  const { answer } = await startSharedChange(orm, fakeGoogle.url, workspace);
  const before = await storedAppConnections(orm);

  await expect(connection.finishAppChange(ctx, answer)).rejects.toBeInstanceOf(OtherWorkspaceError);

  expect(await storedAppConnections(orm)).toEqual(before);
});

test("an own-app consent from before the upgrade cannot replace the shared app", async ({
  orm,
  fakeGoogle,
}) => {
  const { workspace, answer } = await startSharedChange(orm, fakeGoogle.url);
  const { connection, ctx, input } = workspace;
  await connection.finishAppChange(ctx, answer);
  const browserToken = "acme-change-browser";
  const state = sealConsentState(
    TEST_SECRET_BOX,
    {
      flow: "change_google_app",
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      nonce: "acme-consent",
    },
    { browserToken, now: input.now },
  );
  const requests = recordTokenRequests();

  await expect(
    connection.finishAppChange(ctx, {
      ...input,
      state,
      browserToken,
      code: "acme-code",
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(requests).toEqual([]);
});

test("a shared consent returned after a newer reconnect keeps the renewed credentials", async ({
  orm,
  fakeGoogle,
}) => {
  const { workspace, answer } = await startSharedChange(orm, fakeGoogle.url);
  const { ctx, connection, input } = workspace;
  const [before] = await storedAppConnections(orm);
  const ownApp = { ...input, ...ACME.oauthClient };
  const { authorizationUrl, browserToken } = await connection.startAppChange(ctx, ownApp);
  const callback = await consentAtGoogle(authorizationUrl);
  await connection.finishAppChange(ctx, {
    ...ownApp,
    browserToken,
    code: callback.searchParams.get("code")!,
    state: callback.searchParams.get("state")!,
  });
  const renewed = await storedAppConnections(orm);
  expect(renewed[0]!.settings).toEqual(before!.settings);
  expect(renewed[0]!.encryptedSecrets).not.toBe(before!.encryptedSecrets);

  await expect(connection.finishAppChange(ctx, answer)).rejects.toMatchObject({ code: "CONFLICT" });

  expect(await storedAppConnections(orm)).toEqual(renewed);
});

test("a delayed shared consent cannot overwrite a newer own-app change", async ({
  orm,
  fakeGoogle,
}) => {
  const { workspace, relay, grant, answer } = await startSharedChange(orm, fakeGoogle.url);
  const { ctx, connection, input } = workspace;
  const redeeming = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  relay.redeem.mockReset().mockImplementationOnce(async () => {
    redeeming.resolve();
    await resume.promise;
    return Response.json(grant);
  });
  const stale = connection.finishAppChange(ctx, answer);
  await Promise.race([
    redeeming.promise,
    stale.then(() => {
      throw new Error("Expected relay redemption");
    }),
  ]);

  try {
    const { authorizationUrl, browserToken } = await connection.startAppChange(ctx, input);
    const callback = await consentAtGoogle(authorizationUrl);
    await connection.finishAppChange(ctx, {
      ...input,
      browserToken,
      code: callback.searchParams.get("code")!,
      state: callback.searchParams.get("state")!,
    });
  } finally {
    resume.resolve();
  }

  await expect(stale).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await storedAppConnections(orm)).toMatchObject([
    {
      id: workspace.connectionId,
      settings: {
        clientId: input.clientId,
        googleApp: "own_google_app",
        previousClientIds: [ACME.oauthClient.clientId],
      },
    },
  ]);
});

async function startSharedChange(
  orm: Orm,
  googleUrl: string,
  existing?: Awaited<ReturnType<typeof connectedWorkspace>>,
) {
  const workspace = existing ?? (await connectedWorkspace(orm, googleUrl, GOOGLE_RELAY_URL));
  const { now, publicOrigin } = workspace.input;
  const { authorizationUrl, browserToken } = await workspace.connection.startAppChange(
    workspace.ctx,
    {
      ...SHARED_GOOGLE_APP,
      publicOrigin,
      now,
    },
  );
  const authorization = new URL(authorizationUrl);
  expect(authorization.searchParams.get("purpose")).toBe("connect");
  expect(authorization.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{1,256}$/);
  const relay = stubGoogleRelay();
  const grant = await googleRelayGrant(googleUrl, authorization);
  relay.redeem.mockReturnValueOnce(Response.json(grant));
  const answer = {
    publicOrigin,
    now,
    browserToken,
    state: authorization.searchParams.get("state")!,
    handle: RELAY_HANDLE,
  };
  return { workspace, relay, grant, answer, authorization };
}
