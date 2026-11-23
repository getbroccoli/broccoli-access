import {
  ADMIN,
  EMPLOYEE,
  OWNER,
  containerConnections,
  expect,
  ownerHandOver,
  signInToFakeSlack,
  storedAppConnections,
  storedApps,
  storedImportSources,
  storedRecordHistory,
  test,
} from "#test/support";

test("describes the domains and storage keys requested by the fake Slack connector", async ({
  orm,
  fakeConnectors,
}) => {
  const { service } = containerConnections(orm, fakeConnectors.url);

  expect(await service.describeAppSession("slack")).toEqual({
    connector: "slack",
    name: "Slack",
    domains: ["slack.localhost"],
    storageKeys: ["localConfig_v2"],
  });
});

test("the owner reads the workspace for the hand-over without creating a connection", async ({
  orm,
  fakeConnectors,
}) => {
  const { handOver, requestId, appSession } = await ownerHandOver(orm, fakeConnectors);

  expect(handOver).toMatchObject({
    requestId,
    organizationName: "Acme",
    domain: "acme.slack.com",
    appSession: expect.stringMatching(/\S/) as unknown,
  });
  expect(handOver.appSession).not.toContain(appSession.cookies[0]!.value);
  expect(await storedAppConnections(orm)).toEqual([]);
});

test("another admin cannot read the owner's hand-over", async ({ orm, fakeConnectors }) => {
  const { service, requestId } = await ownerHandOver(orm, fakeConnectors);
  expect(await service.readAppSessionHandOver(ADMIN, requestId)).toBeNull();
});

test("an employee cannot read hand-overs", async ({ orm, fakeConnectors }) => {
  const { service } = containerConnections(orm, fakeConnectors.url);
  await expect(service.readAppSessionHandOver(EMPLOYEE, "request")).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

test("a hand-over expires after five minutes", async ({ orm, fakeConnectors }) => {
  let now = new Date("2026-01-01T12:00:00Z");
  const { service, requestId } = await ownerHandOver(orm, fakeConnectors, () => now);

  now = new Date("2026-01-01T12:04:59.999Z");
  expect(await service.readAppSessionHandOver(OWNER, requestId)).not.toBeNull();
  now = new Date("2026-01-01T12:05:00.001Z");
  expect(await service.readAppSessionHandOver(OWNER, requestId)).toBeNull();
});

test.for([
  {
    connector: "linear",
    code: "CONFLICT",
    message: "This connector connects with typed values, not an app session.",
  },
  {
    connector: "absent",
    code: "NOT_FOUND",
    message: "The connectors container has no connector with this key.",
  },
])(
  "refuses an app session for $connector",
  async ({ connector, code, message }, { orm, fakeConnectors }) => {
    const { service } = containerConnections(orm, fakeConnectors.url);
    await expect(
      service.handOverAppSession({
        connector,
        requestId: "request",
        userId: OWNER.user!.userId,
        appSession: { cookies: [], storage: {} },
      }),
    ).rejects.toMatchObject({ code, message });
  },
);

test.for([
  { reason: "a malformed session", appSession: [] },
  {
    reason: "an unrequested storage key",
    appSession: { cookies: [], storage: { unrelated: "test" } },
  },
  {
    reason: "a cookie outside the allowed domain",
    appSession: {
      cookies: [
        {
          name: "theme",
          value: "light",
          domain: "slack.localhost.example",
          path: "/",
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ],
      storage: {},
    },
  },
])("rejects $reason", async ({ appSession }, { orm, fakeConnectors }) => {
  const { service } = containerConnections(orm, fakeConnectors.url);
  await expect(
    service.handOverAppSession({
      connector: "slack",
      requestId: "request",
      userId: OWNER.user!.userId,
      appSession,
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "appSession", code: "invalid" }],
  });
  expect(await service.readAppSessionHandOver(OWNER, "request")).toBeNull();
});

test("rejects a hand-over with an empty request ID", async ({ orm, fakeConnectors }) => {
  const { service } = containerConnections(orm, fakeConnectors.url);
  await expect(
    service.handOverAppSession({
      connector: "slack",
      requestId: "",
      userId: OWNER.user!.userId,
      appSession: { cookies: [], storage: {} },
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "requestId", code: "invalid" }],
  });
});

test("a session Slack refuses never becomes available to the owner", async ({
  orm,
  fakeConnectors,
}) => {
  const { service } = containerConnections(orm, fakeConnectors.url);
  const appSession = await signInToFakeSlack(fakeConnectors);
  const expired = await fetch(new URL("/_fake/slack/sessions/expire", fakeConnectors.url), {
    method: "POST",
  });
  expect(expired.status).toBe(204);
  await expect(
    service.handOverAppSession({
      connector: "slack",
      requestId: "request",
      userId: OWNER.user!.userId,
      appSession,
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "appSession", code: "authentication_failed" }],
  });
  expect(await service.readAppSessionHandOver(OWNER, "request")).toBeNull();
});

test.for(["expired", "tampered", "another user's"] as const)(
  "refuses %s sealed value and saves nothing",
  async (reason, { orm, fakeConnectors }) => {
    let now = new Date("2026-01-01T12:00:00Z");
    const { service, sent, handOver } = await ownerHandOver(orm, fakeConnectors, () => now);
    if (reason === "expired") now = new Date("2026-01-01T12:05:01Z");
    const ctx = reason === "another user's" ? ADMIN : OWNER;
    const appSession =
      reason === "tampered" ? "!" + handOver.appSession.slice(1) : handOver.appSession;

    await expect(
      service.connect(ctx, { connector: "slack", appSession, noticeAccepted: true }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "appSession", code: "invalid" }],
    });
    expect(await storedApps(orm)).toEqual([]);
    expect(await storedAppConnections(orm)).toEqual([]);
    expect(await storedImportSources(orm)).toEqual([]);
    expect(await storedRecordHistory(orm)).toEqual([]);
    expect(sent).toEqual([]);
  },
);

test("refuses a hand-over whose sealed session would not fit the Connect request", async ({
  orm,
  fakeConnectors,
}) => {
  const { service } = containerConnections(orm, fakeConnectors.url);
  const appSession = await signInToFakeSlack(fakeConnectors);
  const config = JSON.parse(appSession.storage.localConfig_v2!) as Record<string, unknown>;
  appSession.storage.localConfig_v2 = JSON.stringify({ ...config, padding: "x".repeat(80_000) });
  const requestId = "oversized";

  await expect(
    service.handOverAppSession({
      connector: "slack",
      requestId,
      userId: OWNER.user!.userId,
      appSession,
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "appSession", code: "too_large" }],
  });
  expect(await service.readAppSessionHandOver(OWNER, requestId)).toBeNull();
});
