import {
  expect,
  OWNER,
  SYSTEM,
  slackSession,
  storedAppAccounts,
  storedAppConnections,
  storedImportSources,
  storedRecordHistory,
  suspendIntegrationUserInDirectory,
  test,
} from "#test/support";

test("finishes Disable with a new app session when the integration user's session expires", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const slack = await slackSession(orm, seed, fakeConnectors);
  const disable = await slack.queueDisable();
  const before = await slack.secrets();
  await slack.expire();

  await disable.run();

  expect(await disable.latest()).toMatchObject({ status: "succeeded", error: null });
  expect(await storedAppConnections(orm)).toMatchObject([
    { status: "connected", reconnectCause: null },
  ]);
  const after = await slack.secrets();
  expect(after?.appSession).toBeDefined();
  expect(after?.appSession).not.toEqual(before?.appSession);
});

test.for(["blocked_by_check", "permission_missing", "authentication_failed"] as const)(
  "shows %s on Disable and its connection when signing in again fails",
  async (code, { orm, seed, fakeConnectors }) => {
    const slack = await slackSession(orm, seed, fakeConnectors);
    const disable = await slack.queueDisable();
    await slack.expire();
    await slack.fail("connections/sign-in", code);

    await disable.run();

    expect(slack.calls.filter((path) => path === "/v1/connections/sign-in")).toHaveLength(1);
    expect(await disable.latest()).toMatchObject({ status: "failed", error: code });
    expect(await storedAppConnections(orm)).toMatchObject([
      { status: "reconnect", reconnectCause: code },
    ]);
  },
);

test("fails only the attempted Disable and keeps Slack connected when its renewed session is refused", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const slack = await slackSession(orm, seed, fakeConnectors);
  const disable = await slack.queueDisable();
  const sam = (await storedAppAccounts(orm)).find(({ email }) => email === "sam@agency.example")!;
  const queued = await slack.changes.changeAccount(OWNER, {
    appAccountId: sam.id,
    action: "suspend",
  });
  await slack.fail("actions/run", "authentication_failed", 2);

  await disable.run();

  expect(slack.calls.filter((path) => path === "/v1/connections/sign-in")).toHaveLength(1);
  expect(slack.calls.filter((path) => path === "/v1/actions/run")).toHaveLength(2);
  expect(await disable.latest()).toMatchObject({
    status: "failed",
    error: "authentication_failed",
  });
  expect(await storedAppConnections(orm)).toMatchObject([
    { status: "connected", reconnectCause: null },
  ]);
  expect(await slack.changes.readAccountChange(OWNER, queued.id)).toMatchObject({
    status: "running",
    error: null,
  });
  expect(
    (await storedRecordHistory(orm)).filter((line) => line.causeKind === "connector_error"),
  ).toEqual([]);
});

test("completes an in-flight Remove when a scan turns Slack to Reconnect after a blocked sign-in", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const slack = await slackSession(orm, seed, fakeConnectors);
  await slack.scans.runScan(SYSTEM, slack.sourceId);
  const elif = (await storedAppAccounts(orm)).find(({ email }) => email === "elif@acme.example")!;
  const remove = await slack.changes.changeAccount(OWNER, {
    appAccountId: elif.id,
    action: "remove",
  });
  await slack.scans.scanNow(OWNER, slack.connectionId);
  await slack.fail("accounts/list", "authentication_failed");
  await slack.fail("connections/sign-in", "blocked_by_check");
  let duringRemove: unknown;
  slack.routes.post("/v1/actions/run", async (_request, _response, next) => {
    await slack.scans.runScan(SYSTEM, slack.sourceId);
    duringRemove = await slack.changes.readAccountChange(OWNER, remove.id);
    next();
  });

  await slack.changes.runChange(SYSTEM, remove.id);

  expect(duringRemove).toMatchObject({ status: "failed", error: "blocked_by_check" });
  expect(await slack.changes.readAccountChange(OWNER, remove.id)).toMatchObject({
    status: "succeeded",
    error: null,
  });
  expect(await storedAppAccounts(orm)).not.toContainEqual(expect.objectContaining({ id: elif.id }));
});

test("shares one sign-in when a scan and Disable reach Slack with the same expired session", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const slack = await slackSession(orm, seed, fakeConnectors);
  const disable = await slack.queueDisable();
  await slack.scans.scanNow(OWNER, slack.connectionId);
  await slack.expire();
  const bothArrived = Promise.withResolvers<void>();
  const paths = new Set<string>();
  slack.routes.post(["/v1/accounts/list", "/v1/actions/run"], async (req, _res, next) => {
    paths.add(req.path);
    if (paths.size === 2) bothArrived.resolve();
    await bothArrived.promise;
    next();
  });

  await Promise.all([slack.scans.runScan(SYSTEM, slack.sourceId), disable.run()]);

  expect(slack.calls.filter((path) => path === "/v1/connections/sign-in")).toHaveLength(1);
  expect(await storedImportSources(orm)).toMatchObject([{ status: "scanned", failure: null }]);
  expect(await disable.latest()).toMatchObject({ status: "succeeded", error: null });
});

test("turns Slack to Reconnect without signing in when Disable uses the owner's expired session", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const slack = await slackSession(orm, seed, fakeConnectors, "extension");
  const disable = await slack.queueDisable();
  await slack.expire();

  await disable.run();

  expect(slack.calls).not.toContain("/v1/connections/sign-in");
  expect(await disable.latest()).toMatchObject({
    status: "failed",
    error: "authentication_failed",
  });
  expect(await storedAppConnections(orm)).toMatchObject([
    { status: "reconnect", reconnectCause: "authentication_failed" },
  ]);
});

test("stops Disable before calling the container when Google shows the integration user suspended", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const slack = await slackSession(orm, seed, fakeConnectors);
  const disable = await slack.queueDisable();
  await suspendIntegrationUserInDirectory(orm, seed);
  const before = slack.calls.length;

  await disable.run();

  expect(slack.calls.slice(before)).toEqual([]);
  expect(await disable.latest()).toMatchObject({
    status: "failed",
    error: "authentication_failed",
  });
  expect(await storedAppConnections(orm)).toContainEqual(
    expect.objectContaining({
      id: slack.connectionId,
      status: "reconnect",
      reconnectCause: "authentication_failed",
    }),
  );
});

test("finishes Disable with the owner's session when Google shows the integration user suspended", async ({
  orm,
  seed,
  fakeConnectors,
}) => {
  const slack = await slackSession(orm, seed, fakeConnectors, "extension");
  const disable = await slack.queueDisable();
  await suspendIntegrationUserInDirectory(orm, seed);

  await disable.run();

  expect(await disable.latest()).toMatchObject({ status: "succeeded", error: null });
  expect(slack.calls).not.toContain("/v1/connections/sign-in");
});
