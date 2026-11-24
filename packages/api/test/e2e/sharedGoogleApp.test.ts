import { ACME } from "@broccoli-access/fake-apps";

import {
  test,
  expect,
  type Browser,
  GOOGLE_RELAY_URL,
  RELAY_HANDLE,
  SHARED_GOOGLE_APP,
  recordTokenRequests,
  stubGoogleRelay,
  googleRelayGrant,
} from "#test/support";

test("shared setup and sign-in callbacks establish sessions for the same owner", async ({
  env,
  fakeGoogle,
}) => {
  await env.restart({ googleRelayUrl: GOOGLE_RELAY_URL });
  const relay = stubGoogleRelay();
  const holder = await env.startSetup();
  const setup = await holder.post("/api/google/connect", SHARED_GOOGLE_APP);
  expect(setup.status).toBe(200);
  const { authorizationUrl } = (await setup.json()) as { authorizationUrl: string };

  expect(await finishCallback(holder, authorizationUrl, fakeGoogle.url, relay)).toBe("/setup/scan");
  const owner = (await (await holder.graphql("{ me { id } }")).json()) as {
    data: { me: { id: string } };
  };
  expect(owner.data.me.id).toBeTruthy();
  const returning = env.browser();
  const start = await returning.getManual("/api/google/sign-in");
  expect(start.status).toBe(302);

  expect(
    await finishCallback(returning, start.headers.get("location")!, fakeGoogle.url, relay),
  ).toBe("/");
  expect(await (await returning.graphql("{ me { id } }")).json()).toEqual(owner);
});

test("the change-app route accepts shared consent and returns the owner to connections", async ({
  env,
  fakeGoogle,
}) => {
  await env.restart({ googleRelayUrl: GOOGLE_RELAY_URL });
  const { browser } = await env.signInAsOwner();
  const relay = stubGoogleRelay();

  const start = await browser.post("/api/google/change-app", SHARED_GOOGLE_APP);

  expect(start.status).toBe(200);
  const { authorizationUrl } = (await start.json()) as { authorizationUrl: string };
  expect(await finishCallback(browser, authorizationUrl, fakeGoogle.url, relay)).toBe(
    "/settings/connections",
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
      "/settings/connections/google-app?changeError=failed",
    );
    expect(exchanges).toEqual([]);
  },
);

async function finishCallback(
  browser: Browser,
  url: string,
  googleUrl: string,
  relay: ReturnType<typeof stubGoogleRelay>,
) {
  const authorization = new URL(url);
  expect(authorization.origin + authorization.pathname).toBe(
    GOOGLE_RELAY_URL + "/google/authorize",
  );
  const grant = await googleRelayGrant(googleUrl, authorization);
  relay.redeem.mockReturnValueOnce(Response.json(grant));
  if (grant.refresh_token) {
    relay.refresh.mockImplementation(() =>
      Response.json({ ok: true, access_token: grant.access_token }),
    );
  }
  const callback = new URL(authorization.searchParams.get("return_to")!);
  callback.searchParams.set("state", authorization.searchParams.get("state")!);
  callback.searchParams.set("handle", RELAY_HANDLE);
  const finished = await browser.getManual(callback.href);
  expect(finished.status).toBe(302);
  return finished.headers.get("location");
}
