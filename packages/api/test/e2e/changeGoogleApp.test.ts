import { ACME } from "@broccoli-access/fake-apps";

import { expect, test, consentAtGoogle, registerGoogleRedirect } from "#test/support";

test("after changing the Google app the owner signs in with the new client", async ({
  env,
  fakeGoogle,
}) => {
  const { browser, user } = await env.signInAsOwner();
  await registerGoogleRedirect(fakeGoogle.url, env.url, NEW_CLIENT);

  const started = await browser.post("/api/google/change-app", NEW_CLIENT);

  expect(started.status).toBe(200);
  const cookie = started.headers
    .getSetCookie()
    .find((value) => value.startsWith("broccoli_access_google_change_app="));
  expect(cookie).toMatch(/^broccoli_access_google_change_app=[^;]+;/);
  expect(cookie).toMatch(/;\s*HttpOnly(?:;|$)/i);
  expect(cookie).toMatch(/;\s*SameSite=Lax(?:;|$)/i);
  expect(cookie).toMatch(/;\s*Path=\/api\/google\/callback(?:;|$)/i);
  const { authorizationUrl } = (await started.json()) as { authorizationUrl: string };
  expect(new URL(authorizationUrl).searchParams.get("client_id")).toBe(NEW_CLIENT.clientId);
  const callback = await consentAtGoogle(authorizationUrl);
  const finished = await browser.getManual(callback.href);
  expect(finished.status).toBe(302);
  expect(finished.headers.get("location")).toBe("/settings/google-workspace");
  await browser.post("/api/auth/sign-out", {});
  const returning = env.browser();
  const signIn = await returning.getManual("/api/google/sign-in");
  expect(signIn.status).toBe(302);
  const signInUrl = new URL(signIn.headers.get("location")!);
  expect(signInUrl.searchParams.get("client_id")).toBe(NEW_CLIENT.clientId);
  const signInCallback = await consentAtGoogle(signInUrl);
  const signedIn = await returning.getManual(signInCallback.href);
  expect(signedIn.status).toBe(302);
  expect(signedIn.headers.get("location")).toBe("/");
  expect(await (await returning.graphql("{ me { id } }")).json()).toEqual({
    data: { me: { id: user.id } },
  });
});

test("cancelling at Google keeps the old Google app", async ({ env, fakeGoogle }) => {
  const { browser } = await env.signInAsOwner();
  await registerGoogleRedirect(fakeGoogle.url, env.url, NEW_CLIENT);
  const started = await browser.post("/api/google/change-app", NEW_CLIENT);
  expect(started.status).toBe(200);
  const { authorizationUrl } = (await started.json()) as { authorizationUrl: string };
  const callback = await consentAtGoogle(authorizationUrl, { decision: "cancel" });

  const finished = await browser.getManual(callback.href);

  expect(finished.status).toBe(302);
  expect(finished.headers.get("location")).toBe(
    "/settings/google-workspace/google-app?changeError=cancelled",
  );
  await browser.post("/api/auth/sign-out", {});
  const signIn = await env.browser().getManual("/api/google/sign-in");
  expect(signIn.status).toBe(302);
  expect(new URL(signIn.headers.get("location")!).searchParams.get("client_id")).toBe(
    ACME.oauthClient.clientId,
  );
});

test("refuses starting a Google app change without a session", async ({ env }) => {
  await env.signInAsOwner();

  const response = await env.browser().post("/api/google/change-app", NEW_CLIENT);

  expect(response.status).toBe(403);
});

const NEW_CLIENT = {
  clientId: "replacement-google-client",
  clientSecret: "replacement-google-secret",
};
