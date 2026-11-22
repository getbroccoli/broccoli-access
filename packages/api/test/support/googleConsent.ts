import assert from "node:assert/strict";

import { ACME } from "@broccoli-access/fake-apps";

/** Registers this test's callback with the local fake Google. */
export async function registerGoogleRedirect(
  googleUrl: string,
  origin: string,
  client: { clientId: string; clientSecret: string } = ACME.oauthClient,
): Promise<void> {
  const response = await fetch(`${googleUrl}/_fake/clients`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...client, redirectUris: [`${origin}/api/google/callback`] }),
  });
  assert.equal(response.status, 204);
}

/** Submits the fake's consent form and returns its callback without following it. */
export async function consentAtGoogle(
  authorizationUrl: string | URL,
  {
    account = "admin@acme.example",
    decision = "allow",
  }: { account?: string; decision?: "allow" | "cancel" } = {},
): Promise<URL> {
  const url = new URL(authorizationUrl);
  const form = new URLSearchParams(url.searchParams);
  form.set("account", account);
  form.set("decision", decision);
  const response = await fetch(`${url.origin}${url.pathname}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
    redirect: "manual",
  });
  assert.equal(response.status, 302);
  const location = response.headers.get("location");
  assert(location);
  return new URL(location);
}
