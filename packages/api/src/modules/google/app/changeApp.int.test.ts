import { ACME } from "@broccoli-access/fake-apps";
import { onTestFinished } from "vitest";

import {
  expect,
  test,
  EMPLOYEE,
  SYSTEM,
  registerGoogleRedirect,
  consentAtGoogle,
  GOOGLE_SCOPES,
  TEST_SECRET_BOX,
  recordHistory,
  postFakeControl,
  storedApps,
  storedAppConnections,
  storedAppAccounts,
  storedRecordHistory,
  changeStoredGoogleDomain,
  connectedWorkspace,
  containerConnectors,
  createGoogleWorkspaceConnector,
  scans,
  startFakeHttpServer,
  storedImportSources,
  storedWorkspace,
} from "#test/support";

import type { Orm } from "../../../core/db";
import { OtherWorkspaceError } from "../domain";

test("changing the Google app replaces credentials and scopes while keeping the owner, apps and people", async ({
  orm,
  fakeGoogle,
}) => {
  const { connection, ctx, input, connectionId } = await connectedWorkspace(orm, fakeGoogle.url);
  const before = await storedWorkspace(orm);
  expect(before.people).toHaveLength(42);
  const [oldConnection] = await storedAppConnections(orm);
  const oldSecrets = JSON.parse(
    TEST_SECRET_BOX.decrypt(oldConnection!.encryptedSecrets, connectionId),
  ) as Record<string, string>;
  const { authorizationUrl, browserToken } = await connection.startAppChange(ctx, input);
  const callback = await consentAtGoogle(authorizationUrl);

  await connection.finishAppChange(ctx, {
    ...input,
    browserToken,
    code: callback.searchParams.get("code")!,
    state: callback.searchParams.get("state")!,
  });

  const saved = await storedAppConnections(orm);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    id: connectionId,
    settings: {
      clientId: input.clientId,
      adminEmail: "admin@acme.example",
      organizationName: "Acme",
      domain: "acme.example",
      grantedScopes: expect.arrayContaining(GOOGLE_SCOPES) as unknown,
    },
  });
  const secrets = JSON.parse(
    TEST_SECRET_BOX.decrypt(saved[0]!.encryptedSecrets, connectionId),
  ) as Record<string, string>;
  expect(secrets).toEqual({
    clientSecret: input.clientSecret,
    refreshToken: expect.any(String) as unknown,
  });
  expect(secrets.refreshToken).toBeTruthy();
  expect(secrets.refreshToken).not.toBe(oldSecrets.refreshToken);
  expect(await storedWorkspace(orm)).toEqual(before);
});

test("a scan after changing the Google app finds no app or account for the previous client", async ({
  orm,
  fakeGoogle,
}) => {
  const { connection, ctx, input, connectionId, scans, sourceId } = await connectedWorkspace(
    orm,
    fakeGoogle.url,
  );
  const appsBefore = await storedApps(orm);
  const accountsBefore = await storedAppAccounts(orm);
  expect(appsBefore).toHaveLength(38);
  const { authorizationUrl, browserToken } = await connection.startAppChange(ctx, input);
  const callback = await consentAtGoogle(authorizationUrl);

  await connection.finishAppChange(ctx, {
    ...input,
    browserToken,
    code: callback.searchParams.get("code")!,
    state: callback.searchParams.get("state")!,
  });
  await scans.scanNow(ctx, connectionId);
  await scans.runScan(SYSTEM, sourceId);

  const appsAfter = await storedApps(orm);
  expect(appsAfter).toEqual(appsBefore);
  expect(await storedAppAccounts(orm)).toEqual(accountsBefore);
  expect(appsAfter.flatMap(({ externalIds }) => externalIds)).not.toContain(
    `google:${ACME.oauthClient.clientId}`,
  );
});

test("changing the Google app twice keeps both previous client ids", async ({
  orm,
  fakeGoogle,
}) => {
  const { connection, ctx, input } = await connectedWorkspace(orm, fakeGoogle.url);
  const [previous] = await storedAppConnections(orm);
  const nextInput = {
    ...input,
    clientId: "third-google-client",
    clientSecret: "third-google-secret",
  };
  await registerGoogleRedirect(fakeGoogle.url, nextInput.publicOrigin, nextInput);

  for (const change of [input, nextInput]) {
    const { authorizationUrl, browserToken } = await connection.startAppChange(ctx, change);
    const callback = await consentAtGoogle(authorizationUrl);
    await connection.finishAppChange(ctx, {
      ...change,
      browserToken,
      code: callback.searchParams.get("code")!,
      state: callback.searchParams.get("state")!,
    });
  }

  const [saved] = await storedAppConnections(orm);
  expect(saved!.settings.clientId).toBe(nextInput.clientId);
  expect(saved!.settings.previousClientIds).toEqual([previous!.settings.clientId, input.clientId]);
});

test("records the Google app change as an update by the owner without secrets in history", async ({
  orm,
  fakeGoogle,
}) => {
  const { connection, ctx, input, connectionId, ownerUserId } = await connectedWorkspace(
    orm,
    fakeGoogle.url,
  );
  const [before] = await storedAppConnections(orm);
  const historyBefore = await recordHistory.read(orm, "app_connection", connectionId, {});
  const { authorizationUrl, browserToken } = await connection.startAppChange(ctx, input);
  const callback = await consentAtGoogle(authorizationUrl);

  await connection.finishAppChange(ctx, {
    ...input,
    browserToken,
    code: callback.searchParams.get("code")!,
    state: callback.searchParams.get("state")!,
  });

  const [saved] = await storedAppConnections(orm);
  const history = await recordHistory.read(orm, "app_connection", connectionId, {});
  expect(history.edges).toHaveLength(historyBefore.edges.length + 1);
  const added = history.edges.filter(
    ({ node }) => !historyBefore.edges.some(({ node: old }) => old.id === node.id),
  );
  expect(added).toHaveLength(1);
  const line = added[0]!.node;
  expect(line).toMatchObject({
    recordType: "app_connection",
    recordId: connectionId,
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
    author: { kind: "SIGNED_IN_USER", id: ownerUserId },
  });
  expect(line.changes).toHaveLength(1);
  expect(line.changes[0]!.field).toBe("settings");
  expect(JSON.parse(line.changes[0]!.oldValue!)).toEqual(before!.settings);
  expect(JSON.parse(line.changes[0]!.newValue!)).toEqual(saved!.settings);
  const secrets = JSON.parse(
    TEST_SECRET_BOX.decrypt(saved!.encryptedSecrets, connectionId),
  ) as Record<string, string>;
  const oldSecrets = JSON.parse(
    TEST_SECRET_BOX.decrypt(before!.encryptedSecrets, connectionId),
  ) as Record<string, string>;
  for (const secret of [
    input.clientSecret,
    secrets.refreshToken!,
    oldSecrets.clientSecret!,
    oldSecrets.refreshToken!,
    "clientSecret",
    "refreshToken",
  ]) {
    expect(JSON.stringify(line)).not.toContain(secret);
  }
});

test("refuses consent from another Google Workspace and changes nothing", async ({
  orm,
  fakeGoogle,
}) => {
  const { connection, ctx, input, connectionId } = await connectedWorkspace(orm, fakeGoogle.url);
  await changeStoredGoogleDomain(orm, connectionId, "globex.example");
  const before = await storedChangeState(orm);
  const { authorizationUrl, browserToken } = await connection.startAppChange(ctx, input);
  const callback = await consentAtGoogle(authorizationUrl);

  await expect(
    connection.finishAppChange(ctx, {
      ...input,
      browserToken,
      code: callback.searchParams.get("code")!,
      state: callback.searchParams.get("state")!,
    }),
  ).rejects.toBeInstanceOf(OtherWorkspaceError);

  expect(await storedChangeState(orm)).toEqual(before);
});

test("refuses an answer started for another browser token and changes nothing", async ({
  orm,
  fakeGoogle,
}) => {
  const { connection, ctx, input } = await connectedWorkspace(orm, fakeGoogle.url);
  const before = await storedChangeState(orm);
  const { authorizationUrl } = await connection.startAppChange(ctx, input);
  const callback = await consentAtGoogle(authorizationUrl);

  await expect(
    connection.finishAppChange(ctx, {
      ...input,
      browserToken: "another-browser",
      code: callback.searchParams.get("code")!,
      state: callback.searchParams.get("state")!,
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });

  expect(await storedChangeState(orm)).toEqual(before);
});

test("refuses starting a Google app change without MANAGE_WORKSPACE", async ({
  orm,
  fakeGoogle,
}) => {
  const { connection, input } = await connectedWorkspace(orm, fakeGoogle.url);
  const before = await storedChangeState(orm);

  await expect(connection.startAppChange(EMPLOYEE, input)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });

  expect(await storedChangeState(orm)).toEqual(before);
});

test.for(["valid", "revoked"] as const)(
  "a scan using a %s old refresh token retries after an app switch without recording stale results",
  async (oldToken, { orm, fakeGoogle }) => {
    const {
      connection,
      ctx,
      input,
      connectionId,
      sourceId,
      scans: retry,
    } = await connectedWorkspace(orm, fakeGoogle.url);
    const { authorizationUrl, browserToken } = await connection.startAppChange(ctx, input);
    const callback = await consentAtGoogle(authorizationUrl);
    const manifest = await startFakeHttpServer(async () => {
      if (oldToken === "revoked") await postFakeControl(fakeGoogle.url, "tokens/revoke");
      await connection.finishAppChange(ctx, {
        ...input,
        browserToken,
        code: callback.searchParams.get("code")!,
        state: callback.searchParams.get("state")!,
      });
      return { status: 200, body: { connectors: [] } };
    });
    onTestFinished(() => manifest.stop());
    const container = containerConnectors(manifest.url);
    const google = createGoogleWorkspaceConnector({
      openIdConfigurationUrl: fakeGoogle.url + "/.well-known/openid-configuration",
      adminApiUrl: fakeGoogle.url,
    });
    const scan = scans(orm, {
      connectors: { list: async () => [google, ...(await container.list())] },
    });
    await scan.scanNow(ctx, connectionId);

    const initialApps = await storedApps(orm);
    const scanHistory = async () =>
      (await storedRecordHistory(orm)).filter(
        (entry) => entry.causeKind === "found_by_scan" || entry.causeKind === "connector_error",
      );
    const initialHistory = await scanHistory();

    await expect(scan.runScan(SYSTEM, sourceId)).rejects.toMatchObject({ code: "CONFLICT" });

    expect(await storedImportSources(orm)).toMatchObject([
      { id: sourceId, status: "scanning", failure: null },
    ]);
    expect(await storedApps(orm)).toEqual(initialApps);
    expect(await scanHistory()).toEqual(initialHistory);

    await retry.runScan(SYSTEM, sourceId);

    expect(await storedApps(orm)).toEqual(initialApps);
    expect(await storedAppConnections(orm)).toMatchObject([
      { settings: { clientId: input.clientId } },
    ]);
    expect(await storedImportSources(orm)).toMatchObject([
      { id: sourceId, status: "scanned", failure: null },
    ]);
  },
);

async function storedChangeState(orm: Orm) {
  return {
    ...(await storedWorkspace(orm)),
    connections: await storedAppConnections(orm),
    history: await storedRecordHistory(orm),
  };
}
