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

test("after switching to the shared app a scan refreshes at the relay and excludes both instance apps", async ({
  orm,
  fakeGoogle,
}) => {
  const { workspace, grant, relay, answer, authorization } = await startSharedChange(
    orm,
    fakeGoogle.url,
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
});

test("a shared app grant from another workspace keeps the original connection", async ({
  orm,
  fakeGoogle,
}) => {
  const {
    workspace: { ctx, connection, connectionId },
    answer,
  } = await startSharedChange(orm, fakeGoogle.url);
  await changeStoredGoogleDomain(orm, connectionId, "other.acme.example");
  const before = await storedAppConnections(orm);

  await expect(connection.finishAppChange(ctx, answer)).rejects.toBeInstanceOf(OtherWorkspaceError);

  expect(await storedAppConnections(orm)).toEqual(before);
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

async function startSharedChange(orm: Orm, googleUrl: string) {
  const workspace = await connectedWorkspace(orm, googleUrl, GOOGLE_RELAY_URL);
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
