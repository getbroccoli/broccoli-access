import { ACME } from "@broccoli-access/fake-apps";

import { expect, test, TEST_OWNER, registerGoogleRedirect, consentAtGoogle } from "#test/support";

test("a fresh instance opens setup at Connect Google with its public redirect address", async ({
  env,
}) => {
  const response = await env
    .browser()
    .graphql("{ me { id } setup { id step holder googleRedirectAddress organizationName } }");

  expect(await response.json()).toEqual({
    data: {
      me: null,
      setup: {
        id: "instance",
        step: "CONNECT_GOOGLE",
        holder: "NOBODY",
        googleRedirectAddress: `${env.url}/api/google/callback`,
        organizationName: null,
      },
    },
  });
});

test("the admin's consent signs them in and redirects to scan with the setup cookie expired", async ({
  env,
  fakeGoogle,
}) => {
  await registerGoogleRedirect(fakeGoogle.url, env.url);
  const browser = await env.startSetup();
  const started = await browser.post("/api/google/connect", ACME.oauthClient);
  expect(started.status).toBe(200);
  const { authorizationUrl } = (await started.json()) as { authorizationUrl: string };
  const callback = await consentAtGoogle(authorizationUrl);

  const response = await browser.getManual(callback.href);

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("/setup/scan");
  expect(response.headers.getSetCookie()).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/^better-auth\.session_token=[^;]+;/),
      expect.stringMatching(/^broccoli_access_setup=;.*Max-Age=0/i),
    ]),
  );
});

test("the connected owner stays signed in and can read Google Workspace on the next request", async ({
  env,
}) => {
  const { browser, user } = await env.signInAsOwner();

  const response = await browser.graphql(
    "{ me { id email isOwner } setup { step holder organizationName googleWorkspace { domain adminEmail organizationName } } }",
  );

  expect(await response.json()).toEqual({
    data: {
      me: { id: user.id, email: TEST_OWNER.email, isOwner: true },
      setup: {
        step: "SCAN",
        holder: "NOBODY",
        organizationName: "Acme",
        googleWorkspace: {
          domain: "acme.example",
          adminEmail: TEST_OWNER.email,
          organizationName: "Acme",
        },
      },
    },
  });
  const session = await browser.get("/api/auth/get-session");
  expect(session.status).toBe(200);
  expect(await session.json()).toMatchObject({ user });
});

test("cancelling Google consent returns to Connect without signing in", async ({
  env,
  fakeGoogle,
}) => {
  await registerGoogleRedirect(fakeGoogle.url, env.url);
  const browser = await env.startSetup();
  const started = await browser.post("/api/google/connect", ACME.oauthClient);
  const { authorizationUrl } = (await started.json()) as { authorizationUrl: string };
  const callback = await consentAtGoogle(authorizationUrl, { decision: "cancel" });

  const response = await browser.getManual(callback.href);

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("/setup?connectError=cancelled");
  expect(response.headers.getSetCookie().some((cookie) => cookie.includes("session_token="))).toBe(
    false,
  );
  expect(await (await browser.graphql("{ me { id } setup { step } }")).json()).toEqual({
    data: { me: null, setup: { step: "CONNECT_GOOGLE" } },
  });
});

test("refuses connecting Google without the setup cookie", async ({ env }) => {
  const response = await env.browser().post("/api/google/connect", ACME.oauthClient);

  expect(response.status).toBe(403);
});
