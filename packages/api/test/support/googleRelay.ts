import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { ACME } from "@broccoli-access/fake-apps";
import { onTestFinished, vi } from "vitest";

import { consentAtGoogle, registerGoogleRedirect } from "./googleConsent";
import { GOOGLE_SCOPES } from "./googleSetup";

export const GOOGLE_RELAY_URL = "https://relay.acme.example/integrations";
export const SHARED_GOOGLE_APP = { googleApp: "broccoli_google_app" } as const;
export const RELAY_HANDLE = "acme-handoff";
export const SHARED_CLIENT_ID = "acme-shared-google-client";

/** Only intercept requests to the configured relay. Google and the instance use real HTTP. */
export function stubGoogleRelay() {
  const redeem = vi.fn<() => Response | Promise<Response>>(unexpectedRelayRequest);
  const refresh = vi.fn<() => Response>(unexpectedRelayRequest);
  const requests: Request[] = [];
  const fetchDirect = globalThis.fetch;
  const stub = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (new URL(url).origin !== new URL(GOOGLE_RELAY_URL).origin) return fetchDirect(input, init);
    const request = new Request(input, init);
    requests.push(request);
    if (request.url === GOOGLE_RELAY_URL + "/google/redeem") return redeem();
    if (request.url === GOOGLE_RELAY_URL + "/google/refresh") return refresh();
    return unexpectedRelayRequest();
  });
  onTestFinished(() => stub.mockRestore());
  return { redeem, refresh, requests };
}

/** A relay redemption must prove possession of the verifier behind the browser's challenge. */
export async function assertRelayRedemption(request: Request, authorization: URL) {
  assert.equal(request.url, GOOGLE_RELAY_URL + "/google/redeem");
  assert.equal(request.method, "POST");
  assert.match(request.headers.get("content-type") ?? "", /^application\/json\b/i);
  const body = (await request.json()) as { code_verifier: string };
  assert.deepEqual(body, {
    handle: RELAY_HANDLE,
    code_verifier: body.code_verifier,
    return_to: authorization.searchParams.get("return_to"),
  });
  assert.match(body.code_verifier, /^[A-Za-z0-9._~-]{43,128}$/);
  assert.equal(
    createHash("sha256").update(body.code_verifier).digest("base64url"),
    authorization.searchParams.get("code_challenge"),
  );
  assert(!authorization.href.includes(body.code_verifier));
}

/** Builds a redeem response with an ID token signed by this test's Google and a usable access token. */
export async function googleRelayGrant(
  googleUrl: string,
  authorization: URL,
  {
    nonce = authorization.searchParams.get("nonce"),
    clientId = SHARED_CLIENT_ID,
    account,
  }: { nonce?: string | null; clientId?: string; account?: string } = {},
) {
  assert(nonce);
  const client = { clientId, clientSecret: ACME.oauthClient.clientSecret };
  await registerGoogleRedirect(googleUrl, GOOGLE_RELAY_URL, client);
  const redirectUri = GOOGLE_RELAY_URL + "/api/google/callback";
  const signIn = authorization.searchParams.get("purpose") === "sign_in";
  const scopes = signIn ? ["openid", "email", "profile"] : GOOGLE_SCOPES;
  const consent = new URL("/o/oauth2/v2/auth", googleUrl);
  consent.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    nonce,
    scope: scopes
      .map((scope) =>
        ["email", "profile"].includes(scope)
          ? "https://www.googleapis.com/auth/userinfo." + scope
          : scope,
      )
      .join(" "),
    ...(!signIn && { access_type: "offline", prompt: "consent" }),
  }).toString();
  const callback = await consentAtGoogle(consent, { account });
  const code = callback.searchParams.get("code");
  assert(code);
  const response = await fetch(new URL("/token", googleUrl), {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: client.clientSecret,
    }),
  });
  assert.equal(response.status, 200);
  const tokens = (await response.json()) as {
    access_token: string;
    id_token: string;
    refresh_token?: string;
    scope: string;
  };
  return {
    ok: true,
    client_id: clientId,
    access_token: tokens.access_token,
    id_token: tokens.id_token,
    refresh_token: tokens.refresh_token ?? null,
    scope: tokens.scope,
  };
}

export function recordTokenRequests() {
  const requests: string[] = [];
  const fetchDirect = globalThis.fetch;
  const stub = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const refreshing =
      init?.body instanceof URLSearchParams && init.body.get("grant_type") === "refresh_token";
    if (
      (url.pathname === "/token" && !refreshing) ||
      url.href === GOOGLE_RELAY_URL + "/google/redeem"
    ) {
      requests.push(url.pathname);
      return Promise.resolve(Response.json({ error: "invalid_grant" }, { status: 400 }));
    }
    return fetchDirect(input, init);
  });
  onTestFinished(() => stub.mockRestore());
  return requests;
}

function unexpectedRelayRequest(): never {
  throw new Error("Unexpected relay request");
}
