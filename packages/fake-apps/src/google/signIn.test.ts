/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Vitest asymmetric matchers return any. */
import { createRemoteJWKSet, jwtVerify } from "jose";
import { expect, onTestFinished } from "vitest";

import {
  ADMIN_SCOPES,
  authorizationParams,
  authorizeCode,
  exchangeCode,
  REDIRECT_URI,
  REPORTS_PATH,
  signIn,
  test as it,
  type DirectoryToken,
  type GrantEvent,
  eventClientId,
  type GrantEvents,
  type FakeState,
  type DirectoryTokens,
} from "#test/support";
import { ACME } from "../seed";
import { startFakeGoogle } from ".";

it("publishes the fake's server endpoints and Google's issuer", async ({ fake }) => {
  const response = await fetch(`${fake.url}/.well-known/openid-configuration`);

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    issuer: "https://accounts.google.com",
    authorization_endpoint: `${fake.url}/o/oauth2/v2/auth`,
    token_endpoint: `${fake.url}/token`,
    userinfo_endpoint: `${fake.url}/v1/userinfo`,
    jwks_uri: `${fake.url}/oauth2/v3/certs`,
  });
});

it("uses the browser address only for browser-facing discovery endpoints", async () => {
  const fake = await startFakeGoogle({
    browserUrl: "http://google.example:4000",
    now: () => new Date("2026-11-21T08:00:00.000Z"),
  });
  onTestFinished(() => fake.stop());

  const response = await fetch(`${fake.url}/.well-known/openid-configuration`);

  expect(await response.json()).toMatchObject({
    authorization_endpoint: "http://google.example:4000/o/oauth2/v2/auth",
    token_endpoint: `${fake.url}/token`,
    userinfo_endpoint: `${fake.url}/v1/userinfo`,
    jwks_uri: `${fake.url}/oauth2/v3/certs`,
  });
});

it.for([
  ["unknown client", { client_id: "unknown-client" }, 401, "invalid_client"],
  [
    "unregistered redirect",
    { redirect_uri: "https://unregistered.example/callback" },
    400,
    "redirect_uri_mismatch",
  ],
] as const)("rejects an %s without redirecting", async ([, overrides, status, error], { fake }) => {
  const response = await fetch(
    `${fake.url}/o/oauth2/v2/auth?${authorizationParams(overrides).toString()}`,
    {
      redirect: "manual",
    },
  );

  expect(response.status).toBe(status);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("content-type")).toContain("text/html");
  expect(await response.text()).toContain(error);
});

it("shows the client, requested scopes, active accounts and consent buttons", async ({ fake }) => {
  const response = await fetch(
    `${fake.url}/o/oauth2/v2/auth?${authorizationParams({ scope: ADMIN_SCOPES }).toString()}`,
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/html");
  const html = await response.text();
  expect(html).toContain(ACME.oauthClient.name);
  for (const scope of ADMIN_SCOPES.split(" ")) expect(html).toContain(scope);
  for (const person of ACME.people) {
    if (person.suspended) expect(html).not.toContain(person.email);
    else expect(html).toContain(person.email);
  }
  expect(html).toMatch(/>\s*Allow\s*</);
  expect(html).toMatch(/>\s*Cancel\s*</);
});

it("redirects Allow to the registered address with a code and unchanged state", async ({
  fake,
}) => {
  const params = authorizationParams({ account: "admin@acme.example", decision: "allow" });

  const response = await fetch(`${fake.url}/o/oauth2/v2/auth`, {
    method: "POST",
    body: params,
    redirect: "manual",
  });

  expect(response.status).toBe(302);
  const location = new URL(response.headers.get("location")!);
  expect(`${location.origin}${location.pathname}`).toBe(REDIRECT_URI);
  expect(location.searchParams.get("code")).toBeTruthy();
  expect(location.searchParams.get("state")).toBe(params.get("state"));
});

it("redirects Cancel with access_denied and unchanged state", async ({ fake }) => {
  const params = authorizationParams({ account: "admin@acme.example", decision: "cancel" });

  const response = await fetch(`${fake.url}/o/oauth2/v2/auth`, {
    method: "POST",
    body: params,
    redirect: "manual",
  });

  expect(response.status).toBe(302);
  const location = new URL(response.headers.get("location")!);
  expect(`${location.origin}${location.pathname}`).toBe(REDIRECT_URI);
  expect(Object.fromEntries(location.searchParams)).toEqual({
    error: "access_denied",
    state: params.get("state"),
  });
  const state = (await fetch(`${fake.url}/_fake/state`).then((result) =>
    result.json(),
  )) as FakeState;
  expect(state.grants).toBe(ACME.grants.length);
  expect(state.events).toBe(27);
});

it("exchanges a code for a Bearer access token and an ID token", async ({ fake }) => {
  const code = await authorizeCode(fake.url);

  const response = await exchangeCode(fake.url, code);

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    access_token: expect.any(String),
    expires_in: 3599,
    scope: "openid email profile",
    token_type: "Bearer",
    id_token: expect.any(String),
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

it.for([undefined, "nonce & + ?"])(
  "signs verifiable RS256 identity claims with nonce %s",
  async (nonce, { fake }) => {
    const tokens = await signIn(fake.url, nonce === undefined ? {} : { nonce });
    const discovery = (await fetch(`${fake.url}/.well-known/openid-configuration`).then(
      (response) => response.json(),
    )) as { jwks_uri: string };
    const person = ACME.people.find((candidate) => candidate.email === "admin@acme.example")!;

    const { payload, protectedHeader } = await jwtVerify(
      tokens.id_token,
      createRemoteJWKSet(new URL(discovery.jwks_uri)),
      {
        issuer: "https://accounts.google.com",
        audience: ACME.oauthClient.clientId,
        algorithms: ["RS256"],
        currentDate: fake.now,
      },
    );

    expect(protectedHeader.alg).toBe("RS256");
    expect(payload.exp).toBeGreaterThan(fake.now.getTime() / 1000);
    expect(payload).toEqual({
      iss: "https://accounts.google.com",
      aud: ACME.oauthClient.clientId,
      sub: person.id,
      email: person.email,
      email_verified: true,
      hd: ACME.customer.domain,
      name: `${person.givenName} ${person.familyName}`,
      given_name: person.givenName,
      family_name: person.familyName,
      iat: fake.now.getTime() / 1000,
      exp: expect.any(Number),
      ...(nonce === undefined ? {} : { nonce }),
    });
  },
);

it("returns the signed-in person's identity from userinfo", async ({ fake }) => {
  const tokens = await signIn(fake.url, { account: "chloe@acme.example" });
  const person = ACME.people.find((candidate) => candidate.email === "chloe@acme.example")!;

  const response = await fetch(`${fake.url}/v1/userinfo`, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    sub: person.id,
    email: person.email,
    email_verified: true,
    hd: ACME.customer.domain,
    name: `${person.givenName} ${person.familyName}`,
    given_name: person.givenName,
    family_name: person.familyName,
  });
});

it("records consent in Directory tokens and Reports", async ({ fake }) => {
  const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });
  const headers = { authorization: `Bearer ${tokens.access_token}` };

  const grants = (await fetch(`${fake.url}/admin/directory/v1/users/admin@acme.example/tokens`, {
    headers,
  }).then((response) => response.json())) as DirectoryTokens;
  const reports = (await fetch(`${fake.url}${REPORTS_PATH}`, { headers }).then((response) =>
    response.json(),
  )) as GrantEvents;

  expect(
    grants.items.filter((grant: DirectoryToken) => grant.clientId === ACME.oauthClient.clientId),
  ).toEqual([
    expect.objectContaining({
      clientId: ACME.oauthClient.clientId,
      displayText: ACME.oauthClient.name,
      scopes: ADMIN_SCOPES.split(" "),
    }),
  ]);
  expect(
    reports.items.filter((event: GrantEvent) => eventClientId(event) === ACME.oauthClient.clientId),
  ).toEqual([
    expect.objectContaining({
      actor: expect.objectContaining({ email: "admin@acme.example" }),
      id: expect.objectContaining({ time: fake.now.toISOString() }),
    }),
  ]);
});
