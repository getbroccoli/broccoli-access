import { ACME } from "@broccoli-access/fake-apps";

import {
  test,
  expect,
  type Browser,
  type TestEnv,
  GOOGLE_RELAY_URL,
  GOOGLE_SCOPES,
  GOOGLE_USER_WRITE_SCOPE,
  INTEGRATION_USER_EMAIL,
  RELAY_HANDLE,
  SHARED_GOOGLE_APP,
  createdGoogleUsers,
  recordTokenRequests,
  refuseGoogleScope,
  stubGoogleRelay,
  assertRelayRedemption,
  googleRelayGrant,
} from "#test/support";

test("a public URL override after shared setup sends owner sign-in to the configured callback", async ({
  env,
  fakeGoogle,
}) => {
  const { browser: holder, relay } = await connectSharedWorkspace(env, fakeGoogle.url);
  const owner = (await (await holder.graphql("{ me { id } }")).json()) as {
    data: { me: { id: string } };
  };
  expect(owner.data.me.id).toBeTruthy();
  const publicUrl = "https://access.acme.example";
  await env.restart({ googleRelayUrl: GOOGLE_RELAY_URL, publicUrl });
  const returning = env.browser();
  const start = await returning.getManual("/api/google/sign-in");
  expect(start.status).toBe(302);
  const authorization = new URL(start.headers.get("location")!);
  expect(authorization.searchParams.get("return_to")).toBe(publicUrl + "/api/google/callback");

  expect(
    (await finishCallback(returning, authorization.href, fakeGoogle.url, relay)).location,
  ).toBe("/");
  await assertRelayRedemption(
    relay.requests.filter((request) => request.url.endsWith("/google/redeem")).at(-1)!,
    authorization,
  );
  expect(await (await returning.graphql("{ me { id } }")).json()).toEqual(owner);
});

test("protected setup remembers the browser's HTTPS origin behind a TLS proxy", async ({ env }) => {
  await env.restart({ googleRelayUrl: GOOGLE_RELAY_URL });
  const holder = await env.startSetup();
  const path = "/api/google/connect";
  const publicOrigin = "https://" + new URL(env.url).host;

  const refused = await holder.post(path, SHARED_GOOGLE_APP, "https://other.acme.example");
  expect(refused.status).toBe(403);
  const allowed = await holder.post(path, SHARED_GOOGLE_APP, publicOrigin);
  const later = await holder.post(path, SHARED_GOOGLE_APP);

  for (const start of [allowed, later]) {
    expect(start.status).toBe(200);
    const { authorizationUrl } = (await start.json()) as { authorizationUrl: string };
    expect(new URL(authorizationUrl).searchParams.get("return_to")).toBe(
      publicOrigin + "/api/google/callback",
    );
  }
});

test("the change-app route accepts shared consent and returns the owner to Google Workspace", async ({
  env,
  fakeGoogle,
}) => {
  await env.restart({ googleRelayUrl: GOOGLE_RELAY_URL });
  const { browser } = await env.signInAsOwner();
  const relay = stubGoogleRelay();

  const start = await browser.post("/api/google/change-app", SHARED_GOOGLE_APP);

  expect(start.status).toBe(200);
  const { authorizationUrl } = (await start.json()) as { authorizationUrl: string };
  expect((await finishCallback(browser, authorizationUrl, fakeGoogle.url, relay)).location).toBe(
    "/settings/google-workspace",
  );
});

test.for(["connect", "change-app"])(
  "the %s route reports an invalid Google app choice as a field error",
  async (route, { env }) => {
    const browser =
      route === "connect" ? await env.startSetup() : (await env.signInAsOwner()).browser;

    const response = await browser.post("/api/google/" + route, { googleApp: "unknown" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "googleApp" }],
    });
  },
);

test.for([
  { repeated: "code", app: SHARED_GOOGLE_APP },
  { repeated: "handle", app: ACME.oauthClient },
])(
  "a change callback with repeated $repeated returns to Settings before exchange",
  async ({ repeated, app }, { env }) => {
    await env.restart({ googleRelayUrl: GOOGLE_RELAY_URL });
    const { browser } = await env.signInAsOwner();
    const start = await browser.post("/api/google/change-app", app);
    expect(start.status).toBe(200);
    const { authorizationUrl } = (await start.json()) as { authorizationUrl: string };
    const callback = new URL("/api/google/callback", env.url);
    callback.search = new URLSearchParams([
      ["state", new URL(authorizationUrl).searchParams.get("state")!],
      ["handle", "invalid"],
      ["code", "invalid"],
      [repeated, "invalid"],
    ]).toString();
    const exchanges = recordTokenRequests();

    const refused = await browser.getManual(callback.href);

    expect(refused.status).toBe(302);
    expect(refused.headers.get("location")).toBe(
      "/settings/google-workspace/google-app?changeError=failed",
    );
    expect(exchanges).toEqual([]);
  },
);

test("shared write consent creates the integration user and renews the same connection's grant", async ({
  env,
  fakeGoogle,
}) => {
  const { browser, relay } = await connectSharedWorkspace(env, fakeGoogle.url);
  const before = await readSettings(browser);
  const email = `${"a".repeat(64)}@acme.example`;

  const started = await browser.post("/api/google/integration-user", { email });
  expect(started.status, await started.clone().text()).toBe(200);
  const { authorizationUrl } = (await started.json()) as { authorizationUrl: string };
  const authorization = new URL(authorizationUrl);
  expect(authorization.searchParams.get("purpose")).toBe("user_write");
  expect(authorization.searchParams.get("return_to")).toBe(`${env.url}/api/google/callback`);

  const { location, grant } = await finishCallback(
    browser,
    authorizationUrl,
    fakeGoogle.url,
    relay,
  );

  expect(location).toBe("/settings/google-workspace");
  await assertRelayRedemption(
    relay.requests.filter((request) => request.url.endsWith("/google/redeem")).at(-1)!,
    authorization,
  );
  expect(await readSettings(browser)).toEqual({
    integrationUser: { email },
    googleWorkspace: { ...before.googleWorkspace, canChangeUsers: true },
  });
  expect(await createdGoogleUsers(fakeGoogle.url)).toEqual([
    { primaryEmail: email, suspended: false, changePasswordAtNextLogin: false },
  ]);

  expect(grant.refresh_token).toBeTruthy();
  const saved = await env.readConnectionWithSecrets(before.googleWorkspace.id);
  expect(saved?.secrets.refreshToken).toBe(grant.refresh_token);
  expect(saved?.connection.settings.grantedScopes).toEqual(
    expect.arrayContaining([...GOOGLE_SCOPES, GOOGLE_USER_WRITE_SCOPE]),
  );
});

test.for([
  { error: "permission_refused", refusedScope: GOOGLE_USER_WRITE_SCOPE },
  { error: "not_super_admin", account: "chloe@acme.example" },
])(
  "refuses shared integration user consent with $error and keeps the grant",
  async ({ error, refusedScope, account }, { env, fakeGoogle }) => {
    const { browser, relay } = await connectSharedWorkspace(env, fakeGoogle.url);
    const before = await readSettings(browser);
    if (refusedScope) await refuseGoogleScope(fakeGoogle.url, refusedScope);

    const started = await browser.post("/api/google/integration-user", {
      email: INTEGRATION_USER_EMAIL,
    });
    expect(started.status, await started.clone().text()).toBe(200);
    const { authorizationUrl } = (await started.json()) as { authorizationUrl: string };
    const { location } = await finishCallback(
      browser,
      authorizationUrl,
      fakeGoogle.url,
      relay,
      account,
    );

    expect(location).toBe(`/settings/google-workspace?integrationUserError=${error}`);
    expect(await readSettings(browser)).toEqual(before);
    expect(await createdGoogleUsers(fakeGoogle.url)).toEqual([]);
  },
);

test("shared write consent returns to People and enables directory writes", async ({
  env,
  fakeGoogle,
}) => {
  const { browser, relay } = await connectSharedWorkspace(env, fakeGoogle.url);
  expect((await readSettings(browser)).googleWorkspace.canChangeUsers).toBe(false);

  const started = await browser.post("/api/google/user-writes", { returnTo: "/people" });
  expect(started.status, await started.clone().text()).toBe(200);
  const { authorizationUrl } = (await started.json()) as { authorizationUrl: string };
  expect(new URL(authorizationUrl).searchParams.get("purpose")).toBe("user_write");
  const { location } = await finishCallback(browser, authorizationUrl, fakeGoogle.url, relay);

  expect(location).toBe("/people?googleUserWrites=allowed");
  expect((await readSettings(browser)).googleWorkspace.canChangeUsers).toBe(true);
});

async function connectSharedWorkspace(env: TestEnv, googleUrl: string) {
  await env.restart({ googleRelayUrl: GOOGLE_RELAY_URL });
  const relay = stubGoogleRelay();
  const browser = await env.startSetup();
  const setup = await browser.post("/api/google/connect", SHARED_GOOGLE_APP);
  expect(setup.status).toBe(200);
  const { authorizationUrl } = (await setup.json()) as { authorizationUrl: string };
  expect((await finishCallback(browser, authorizationUrl, googleUrl, relay)).location).toBe(
    "/setup/scan",
  );
  return { browser, relay };
}

async function readSettings(browser: Browser) {
  const response = await browser.graphql(`{
    setup { integrationUser { email } googleWorkspace { id adminEmail canChangeUsers } }
  }`);
  const { data } = (await response.json()) as {
    data: {
      setup: {
        integrationUser: { email: string } | null;
        googleWorkspace: { id: string; adminEmail: string; canChangeUsers: boolean };
      };
    };
  };
  return data.setup;
}

async function finishCallback(
  browser: Browser,
  url: string,
  googleUrl: string,
  relay: ReturnType<typeof stubGoogleRelay>,
  account?: string,
) {
  const authorization = new URL(url);
  expect(authorization.origin + authorization.pathname).toBe(
    GOOGLE_RELAY_URL + "/google/authorize",
  );
  const grant = await googleRelayGrant(googleUrl, authorization, { account });
  relay.redeem.mockReturnValueOnce(Response.json(grant));
  if (grant.refresh_token && authorization.searchParams.get("purpose") !== "user_write") {
    relay.refresh.mockImplementation(() =>
      Response.json({ ok: true, access_token: grant.access_token }),
    );
  }
  const callback = new URL(authorization.searchParams.get("return_to")!);
  callback.searchParams.set("state", authorization.searchParams.get("state")!);
  callback.searchParams.set("handle", RELAY_HANDLE);
  const finished = await browser.getManual(callback.pathname + callback.search);
  expect(finished.status).toBe(302);
  return { location: finished.headers.get("location"), grant };
}
