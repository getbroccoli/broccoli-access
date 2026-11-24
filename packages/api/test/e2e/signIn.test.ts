import { expect, test, consentAtGoogle } from "#test/support";

test("the owner signs back in with Google and keeps the session on later requests", async ({
  env,
}) => {
  const { browser: ownerBrowser, user } = await env.signInAsOwner();
  await ownerBrowser.post("/api/auth/sign-out", {});
  const browser = env.browser();

  const started = await browser.getManual("/api/google/sign-in");
  expect(started.status).toBe(302);
  const signInCookie = started.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("broccoli_access_google_sign_in="));
  expect(signInCookie).toMatch(/^broccoli_access_google_sign_in=[^;]+;/);
  expect(signInCookie).toMatch(/;\s*HttpOnly(?:;|$)/i);
  expect(signInCookie).toMatch(/;\s*SameSite=Lax(?:;|$)/i);
  expect(signInCookie).toMatch(/;\s*Path=\/api\/google\/callback(?:;|$)/i);
  const callback = await consentAtGoogle(started.headers.get("location")!);
  const response = await browser.getManual(callback.href);

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("/");
  expect(response.headers.getSetCookie()).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/^better-auth\.session_token=[^;]+;/),
      expect.stringMatching(/^broccoli_access_google_sign_in=;/),
    ]),
  );
  expect(await (await browser.graphql("{ me { id } }")).json()).toEqual({
    data: { me: { id: user.id } },
  });
  expect(await (await browser.graphql("{ me { id } }")).json()).toEqual({
    data: { me: { id: user.id } },
  });
});

test("sends an unknown Google account back to login without a session", async ({ env }) => {
  await env.signInAsOwner();
  const browser = env.browser();
  const started = await browser.getManual("/api/google/sign-in");
  expect(started.status).toBe(302);
  const callback = await consentAtGoogle(started.headers.get("location")!, {
    account: "chloe@acme.example",
  });

  const response = await browser.getManual(callback.href);

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("/login?signInError=not_allowed");
  expect(response.headers.getSetCookie().some((cookie) => cookie.includes("session_token="))).toBe(
    false,
  );
  expect(await (await browser.graphql("{ me { id } }")).json()).toEqual({ data: { me: null } });
});

test("an older sign-in callback leaves the newer sign-in usable in the same browser", async ({
  env,
}) => {
  const { user } = await env.signInAsOwner();
  const browser = env.browser();
  const first = await browser.getManual("/api/google/sign-in");
  const second = await browser.getManual("/api/google/sign-in");
  const older = await consentAtGoogle(first.headers.get("location")!);
  const current = await consentAtGoogle(second.headers.get("location")!);

  const refused = await browser.getManual(older.href);
  expect(refused.headers.get("location")).toBe("/login?signInError=failed");
  const accepted = await browser.getManual(current.href);

  expect(accepted.headers.get("location")).toBe("/");
  expect(await (await browser.graphql("{ me { id } }")).json()).toEqual({
    data: { me: { id: user.id } },
  });
});
