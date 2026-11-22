import {
  expect,
  test,
  SETUP_HOLDER,
  googleSetup,
  consentAtGoogle,
  storedApps,
  storedAppConnections,
  recordHistory,
} from "#test/support";

test("approves Google Workspace and records both creations as edits by the new owner", async ({
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

  const apps = await storedApps(orm);
  expect(apps).toMatchObject([
    {
      catalogKey: "google_workspace",
      name: "Google Workspace",
      domain: "workspace.google.com",
      status: "approved",
      externalIds: [],
    },
  ]);
  const connections = await storedAppConnections(orm);
  expect(connections).toMatchObject([{ appId: apps[0]!.id }]);
  const appHistory = await recordHistory.read(orm, "app", apps[0]!.id, {});
  const connectionHistory = await recordHistory.read(orm, "app_connection", connections[0]!.id, {});
  for (const history of [appHistory, connectionHistory]) {
    expect(history.edges).toHaveLength(1);
    expect(history.edges[0]!.node).toMatchObject({
      operation: "CREATED",
      author: { kind: "SIGNED_IN_USER", id: userId },
      cause: { kind: "EDITED_DIRECTLY" },
    });
  }
});
