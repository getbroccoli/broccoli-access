/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Vitest asymmetric matchers return any. */
import { expect } from "vitest";

import {
  authorizationParams,
  authorizeCode,
  control,
  exchangeCode,
  refreshAccessToken,
  REDIRECT_URI,
  signIn,
  test as it,
  type TokenResponse,
  type FakeState,
} from "#test/support";
import { ACME } from "../seed";

it("issues no refresh token for online consent", async ({ fake }) => {
  const tokens = await signIn(fake.url, { prompt: "consent" });

  expect(tokens).not.toHaveProperty("refresh_token");
});

it("issues a refresh token for first offline consent", async ({ fake }) => {
  const tokens = await signIn(fake.url, { access_type: "offline" });

  expect(tokens.refresh_token).toEqual(expect.any(String));
  expect(tokens.refresh_token).not.toBe("");
});

it("does not issue a refresh token or another event for previously approved scopes", async ({
  fake,
}) => {
  await signIn(fake.url, { access_type: "offline" });
  const before = (await fetch(`${fake.url}/_fake/state`).then((response) =>
    response.json(),
  )) as FakeState;

  const tokens = await signIn(fake.url, { access_type: "offline" });

  expect(tokens).not.toHaveProperty("refresh_token");
  expect(await fetch(`${fake.url}/_fake/state`).then((response) => response.json())).toEqual(
    before,
  );
});

it("still shows the consent page for a previously consenting account", async ({ fake }) => {
  await signIn(fake.url);

  const response = await fetch(`${fake.url}/o/oauth2/v2/auth?${authorizationParams().toString()}`, {
    redirect: "manual",
  });

  expect(response.status).toBe(200);
  expect(await response.text()).toContain("Allow");
});

it("issues another refresh token and event when consent is explicitly requested", async ({
  fake,
}) => {
  const first = await signIn(fake.url, { access_type: "offline" });
  const before = (await fetch(`${fake.url}/_fake/state`).then((response) =>
    response.json(),
  )) as FakeState;

  const second = await signIn(fake.url, {
    access_type: "offline",
    prompt: "select_account consent",
  });

  expect(second.refresh_token).toEqual(expect.any(String));
  expect(second.refresh_token).not.toBe(first.refresh_token);
  const after = (await fetch(`${fake.url}/_fake/state`).then((response) =>
    response.json(),
  )) as FakeState;
  expect(after.grants).toBe(before.grants);
  expect(after.events).toBe(before.events + 1);
});

it("exchanges a refresh token for a new access token", async ({ fake }) => {
  const tokens = await signIn(fake.url, { access_type: "offline" });

  const response = await refreshAccessToken(fake.url, tokens.refresh_token!);

  expect(response.status).toBe(200);
  const refreshed = (await response.json()) as TokenResponse;
  expect(refreshed).toMatchObject({
    access_token: expect.any(String),
    expires_in: 3599,
    scope: tokens.scope,
    token_type: "Bearer",
  });
  expect(refreshed.access_token).not.toBe(tokens.access_token);
  expect(refreshed).not.toHaveProperty("refresh_token");
  expect(
    (
      await fetch(`${fake.url}/v1/userinfo`, {
        headers: { authorization: `Bearer ${refreshed.access_token}` },
      })
    ).status,
  ).toBe(200);
});

it("allows an authorization code to be exchanged only once", async ({ fake }) => {
  const code = await authorizeCode(fake.url);
  expect((await exchangeCode(fake.url, code)).status).toBe(200);

  const response = await exchangeCode(fake.url, code);

  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: "invalid_grant" });
});

it("rejects a wrong client secret", async ({ fake }) => {
  const code = await authorizeCode(fake.url);

  const response = await exchangeCode(fake.url, code, { client_secret: "wrong-secret" });

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "invalid_client" });
});

it("rejects a revoked refresh token with Google's invalid_grant body", async ({ fake }) => {
  const tokens = await signIn(fake.url, { access_type: "offline" });
  await control(fake.url, "/tokens/revoke");

  const response = await refreshAccessToken(fake.url, tokens.refresh_token!);

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: "invalid_grant",
    error_description: "Token has been expired or revoked.",
  });
});

it("accepts HTTP Basic client credentials when exchanging a code", async ({ fake }) => {
  const code = await authorizeCode(fake.url);
  const credentials = Buffer.from(
    `${ACME.oauthClient.clientId}:${ACME.oauthClient.clientSecret}`,
  ).toString("base64");

  const response = await fetch(`${fake.url}/token`, {
    method: "POST",
    headers: { authorization: `Basic ${credentials}` },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    access_token: expect.any(String),
    token_type: "Bearer",
  });
});
