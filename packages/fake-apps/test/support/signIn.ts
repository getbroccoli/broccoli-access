import { expect } from "vitest";

import { ACME } from "../../src/seed";
import { REDIRECT_URI } from "./fakeGoogle";

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  id_token: string;
  refresh_token?: string;
}

export function authorizationParams(overrides: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({
    client_id: ACME.oauthClient.clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state: "state with spaces & + ?",
    ...overrides,
  });
}

export async function authorizeCode(
  url: string,
  overrides: Record<string, string> = {},
): Promise<string> {
  const response = await fetch(`${url}/o/oauth2/v2/auth`, {
    method: "POST",
    body: authorizationParams({ account: "admin@acme.example", decision: "allow", ...overrides }),
    redirect: "manual",
  });
  expect(response.status).toBe(302);
  const location = new URL(response.headers.get("location")!);
  const code = location.searchParams.get("code");
  expect(code).toEqual(expect.any(String));
  expect(code).not.toBe("");
  return code!;
}

export function exchangeCode(
  url: string,
  code: string,
  overrides: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${url}/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: ACME.oauthClient.clientId,
      client_secret: ACME.oauthClient.clientSecret,
      ...overrides,
    }),
  });
}

export async function signIn(
  url: string,
  options: Record<string, string> = {},
): Promise<TokenResponse> {
  const { client_secret = ACME.oauthClient.clientSecret, ...authorization } = options;
  const code = await authorizeCode(url, authorization);
  const response = await exchangeCode(url, code, {
    client_id: authorization.client_id ?? ACME.oauthClient.clientId,
    client_secret,
    redirect_uri: authorization.redirect_uri ?? REDIRECT_URI,
  });
  expect(response.status).toBe(200);
  return response.json() as Promise<TokenResponse>;
}

export function refreshAccessToken(url: string, refreshToken: string): Promise<Response> {
  return fetch(`${url}/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: ACME.oauthClient.clientId,
      client_secret: ACME.oauthClient.clientSecret,
    }),
  });
}
