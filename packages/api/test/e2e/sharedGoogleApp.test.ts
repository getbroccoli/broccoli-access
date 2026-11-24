import {
  test,
  expect,
  type Browser,
  GOOGLE_RELAY_URL,
  RELAY_HANDLE,
  SHARED_GOOGLE_APP,
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

async function finishCallback(
  browser: Browser,
  url: string,
  googleUrl: string,
  relay: ReturnType<typeof stubGoogleRelay>,
) {
  const authorization = new URL(url);
  expect(authorization.origin).toBe(GOOGLE_RELAY_URL);
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
