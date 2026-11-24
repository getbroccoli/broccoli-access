import {
  expect,
  test,
  connectorTest,
  type Browser,
  failIntegrationUserSetup,
  postFakeControl,
  createdGoogleUsers,
  consentAtGoogle,
  readGoogleConnection,
  finishSetupWithPreselectedApps,
  SCAN_NOW,
} from "#test/support";

connectorTest(
  "the integration user signs in with two steps and stays out of People",
  async ({ env, fakeGoogle }) => {
    const { browser } = await env.signInAsOwner();
    await finishSetupWithPreselectedApps(browser);
    const before = await readGoogleConnection(browser);
    expect(await readSettings(browser)).toEqual(EMPTY_SETTINGS);

    const started = await browser.post("/api/google/integration-user", { email: EMAIL });

    expect(started.status).toBe(200);
    const cookie = started.headers
      .getSetCookie()
      .find((value) => value.startsWith("broccoli_access_google_integration_user="));
    expect(cookie).toMatch(/^broccoli_access_google_integration_user=[^;]+;/);
    expect(cookie).toMatch(/;\s*HttpOnly(?:;|$)/i);
    expect(cookie).toMatch(/;\s*SameSite=Lax(?:;|$)/i);
    expect(cookie).toMatch(/;\s*Path=\/api\/google\/callback(?:;|$)/i);
    const body = (await started.json()) as { authorizationUrl: string };
    expect(body).toEqual({ authorizationUrl: expect.any(String) as unknown });
    const callback = await consentAtGoogle(body.authorizationUrl);
    const finished = await browser.getManual(callback.href);
    expect(finished.status).toBe(302);
    expect(finished.headers.get("location")).toBe("/settings/connections");
    expect(await createdGoogleUsers(fakeGoogle.url)).toEqual([
      { primaryEmail: EMAIL, suspended: false, changePasswordAtNextLogin: false },
    ]);
    await expect
      .poll(() => readSettings(browser), { timeout: 5_000 })
      .toEqual({
        data: {
          setup: {
            integrationUser: { id: expect.stringMatching(/.+/) as unknown, email: EMAIL, ...READY },
            googleWorkspace: { canChangeUsers: true },
          },
        },
      });

    const scan = await browser.graphql(SCAN_NOW, { connectionId: before.id });
    expect(await scan.json()).toMatchObject({
      data: { imports: { scanConnection: { scan: { status: "SCANNING" } } } },
    });
    await expect
      .poll(
        async () => {
          const { scan } = await readGoogleConnection(browser);
          return scan.status === "SCANNED" && scan.readAt !== before.scan.readAt;
        },
        { timeout: 60_000, interval: 250 },
      )
      .toBe(true);
    const people = await browser.graphql(
      `{ employees(first: 100) { edges { node { email } } pageInfo { hasNextPage } } }`,
    );
    const { data } = (await people.json()) as {
      data: {
        employees: { edges: { node: { email: string } }[]; pageInfo: { hasNextPage: boolean } };
      };
    };
    expect(data.employees.pageInfo.hasNextPage).toBe(false);
    expect(data.employees.edges).toHaveLength(42);
    expect(data.employees.edges.map(({ node }) => node.email)).not.toContain(EMAIL);
  },
  90_000,
);

connectorTest(
  "the owner retries a blocked sign-in from Settings",
  async ({ env, fakeConnectors }) => {
    const { browser } = await env.signInAsOwner();
    await failIntegrationUserSetup(fakeConnectors.url, "blocked_by_check");
    const started = await browser.post("/api/google/integration-user", { email: EMAIL });
    const { authorizationUrl } = (await started.json()) as { authorizationUrl: string };
    const callback = await consentAtGoogle(authorizationUrl);
    expect((await browser.getManual(callback.href)).status).toBe(302);
    await expect
      .poll(() => readSettings(browser), { timeout: 5_000 })
      .toMatchObject({
        data: {
          setup: {
            integrationUser: {
              email: EMAIL,
              signInStatus: "SIGN_IN_NEEDS_OWNER",
              signInFailure: "BLOCKED_BY_CHECK",
            },
          },
        },
      });
    await postFakeControl(fakeConnectors.url, "delay", { milliseconds: 750 });

    const retry = await browser.graphql(`mutation {
      google { signInAsIntegrationUser { integrationUser { id signInStatus signInFailure } } }
    }`);

    expect(await retry.json()).toEqual({
      data: {
        google: {
          signInAsIntegrationUser: {
            integrationUser: {
              id: expect.stringMatching(/.+/) as unknown,
              signInStatus: "SETTING_UP_TWO_STEP_SIGN_IN",
              signInFailure: null,
            },
          },
        },
      },
    });
    await expect
      .poll(() => readSettings(browser), { timeout: 5_000 })
      .toMatchObject({
        data: { setup: { integrationUser: { email: EMAIL, ...READY } } },
      });
  },
);

test("cancelling at Google returns to Connections with read-only access and no integration user", async ({
  env,
}) => {
  const { browser } = await env.signInAsOwner();
  const started = await browser.post("/api/google/integration-user", { email: EMAIL });
  expect(started.status).toBe(200);
  const { authorizationUrl } = (await started.json()) as { authorizationUrl: string };
  const callback = await consentAtGoogle(authorizationUrl, { decision: "cancel" });

  const finished = await browser.getManual(callback.href);

  expect(finished.status).toBe(302);
  expect(finished.headers.get("location")).toBe(
    "/settings/connections?integrationUserError=cancelled",
  );
  expect(await readSettings(browser)).toEqual(EMPTY_SETTINGS);
});

test("returns 400 when the owner posts an array to start creation", async ({ env }) => {
  const { browser } = await env.signInAsOwner();

  const response = await browser.post("/api/google/integration-user", []);

  expect(response.status).toBe(400);
});

test("refuses to start creation without a session", async ({ env }) => {
  await env.signInAsOwner();

  const response = await env.browser().post("/api/google/integration-user", { email: EMAIL });

  expect(response.status).toBe(403);
});

const EMAIL = "broccoli@acme.example";
const SETTINGS =
  "{ setup { integrationUser { id email signInStatus signInFailure } googleWorkspace { canChangeUsers } } }";
const READY = { signInStatus: "SIGNS_IN_WITH_TWO_STEP_SIGN_IN", signInFailure: null };
const EMPTY_SETTINGS = {
  data: { setup: { integrationUser: null, googleWorkspace: { canChangeUsers: false } } },
};

async function readSettings(browser: Browser): Promise<unknown> {
  return (await browser.graphql(SETTINGS)).json();
}
