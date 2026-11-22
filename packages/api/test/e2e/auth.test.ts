import { ACME } from "@broccoli-access/fake-apps";

import { expect, test, consentAtGoogle, registerGoogleRedirect } from "#test/support";

test.for([
  "/api/auth/sign-in/email",
  "/api/auth/setup",
  "/api/auth/request-password-reset",
  "/api/auth/reset-password",
])("password endpoint %s is gone", async (path, { env }) => {
  const response = await env.browser().post(path, {
    email: "admin@acme.example",
    password: "unused-password",
    token: "unused-token",
  });

  expect(response.status).toBe(404);
});

test("password reset availability is gone from the setup schema", async ({ env }) => {
  const response = await env.browser().graphql("{ setup { passwordResetByEmail } }");

  expect(await response.json()).toMatchObject({
    errors: [{ extensions: { code: "GRAPHQL_VALIDATION_FAILED" } }],
  });
});

test("ends the session on logout", async ({ env }) => {
  const { browser } = await env.signInAsOwner();

  const response = await browser.post("/api/auth/sign-out", {});

  expect(response.status).toBe(200);
  const session = await browser.get("/api/auth/get-session");
  expect(session.status).toBe(200);
  expect(await session.json()).toBeNull();
});

test("refuses sign-out from another origin", async ({ env }) => {
  const { browser } = await env.signInAsOwner();

  const response = await browser.postForm(
    "/api/auth/sign-out",
    new URLSearchParams(),
    "https://evil.example.com",
  );

  expect(response.status).toBe(403);
  expect(await (await browser.get("/api/auth/get-session")).json()).not.toBeNull();
});

test("the old cookie no longer resolves after logout", async ({ env, fakeGoogle }) => {
  await registerGoogleRedirect(fakeGoogle.url, env.url);
  const browser = await env.startSetup();
  const started = await browser.post("/api/google/connect", ACME.oauthClient);
  const { authorizationUrl } = (await started.json()) as { authorizationUrl: string };
  const callback = await consentAtGoogle(authorizationUrl);
  const signedIn = await browser.getManual(callback.href);
  const cookie = signedIn.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("better-auth.session_token="))
    ?.split(";", 1)[0];
  expect(cookie).toBeDefined();

  await browser.post("/api/auth/sign-out", {});
  const response = await fetch(new URL("/api/graphql", env.url), {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookie! },
    body: JSON.stringify({ query: "{ me { id } }" }),
  });

  expect(await response.json()).toEqual({ data: { me: null } });
});
