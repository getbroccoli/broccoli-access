/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Vitest asymmetric matchers return any. */
import { expect } from "vitest";

import {
  ADMIN_SCOPES,
  insertGoogleUser,
  updateGoogleUser,
  NEW_USER,
  USER_WRITE_SCOPE,
  authorizationParams,
  control,
  DAY,
  eventClientId,
  refreshAccessToken,
  REPORTS_PATH,
  signIn,
  test as it,
  USERS_PATH,
  type DirectoryToken,
  type DirectoryUser,
  type GrantEvent,
  type GrantEvents,
  type FakeState,
  type DirectoryUsers,
  type DirectoryTokens,
} from "#test/support";
import { ACME } from "../seed";

it("returns 404 when suspending an unknown person", async ({ fake }) => {
  const response = await fetch(`${fake.url}/_fake/users/unknown@acme.example/suspend`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });

  expect(response.status).toBe(404);
});

it("refuses a control request a browser sends from another site", async ({ fake }) => {
  const response = await fetch(`${fake.url}/_fake/users/chloe@acme.example/suspend`, {
    method: "POST",
    headers: {
      origin: "https://attacker.example",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "",
  });

  expect(response.status).toBe(403);
  const state = await fetch(`${fake.url}/_fake/state`);
  expect(await state.json()).toMatchObject({ suspendedPeople: 2 });
});

it("rejects an unknown connector error without changing state", async ({ fake }) => {
  const before = await fetch(`${fake.url}/_fake/state`).then((response) => response.json());

  const response = await fetch(`${fake.url}/_fake/failures`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: "directory.users.list", error: "unknown", count: 1 }),
  });

  expect(response.status).toBe(400);
  expect(await fetch(`${fake.url}/_fake/state`).then((result) => result.json())).toEqual(before);
});

it("reports the unmodified seed counts without authentication", async ({ fake }) => {
  const response = await fetch(`${fake.url}/_fake/state`);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(SEED_STATE);
});

it.for([
  ["chloe@acme.example", "suspend", true],
  ["ana@acme.example", "unsuspend", false],
] as const)("applies %s %s to Directory users", async ([email, action, suspended], { fake }) => {
  const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });

  await control(fake.url, `/users/${email}/${action}`);

  const response = await fetch(`${fake.url}${USERS_PATH}`, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as DirectoryUsers;
  expect(body.users.find((person: DirectoryUser) => person.primaryEmail === email)?.suspended).toBe(
    suspended,
  );
  const state = (await fetch(`${fake.url}/_fake/state`).then((result) =>
    result.json(),
  )) as FakeState;
  expect(state.suspendedPeople).toBe(suspended ? 3 : 1);
});

it("counts distinct granted clients rather than grants as apps", async ({ fake }) => {
  for (const email of ["ana@acme.example", "ben@acme.example"]) {
    await control(fake.url, "/grants", { email, clientId: "new-app", appName: "New app" });
  }

  const response = await fetch(`${fake.url}/_fake/state`);

  expect(await response.json()).toEqual({
    ...SEED_STATE,
    apps: 38,
    grants: ACME.grants.length + 2,
    events: 29,
  });
});

it.for([undefined, 12, 181])(
  "adds a grant with age %s and logs only recent grants",
  async (daysBefore, { fake }) => {
    const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });
    const grantedAt = new Date(fake.now.getTime() - (daysBefore ?? 0) * DAY).toISOString();

    await control(fake.url, "/grants", {
      email: "ana@acme.example",
      clientId: "new-app",
      appName: "New app",
      ...(daysBefore === undefined ? {} : { grantedAt }),
    });

    const headers = { authorization: `Bearer ${tokens.access_token}` };
    const grants = (await fetch(`${fake.url}/admin/directory/v1/users/ana@acme.example/tokens`, {
      headers,
    }).then((response) => response.json())) as DirectoryTokens;
    expect(grants.items).toContainEqual(
      expect.objectContaining({ clientId: "new-app", displayText: "New app" }),
    );
    const reports = (await fetch(`${fake.url}${REPORTS_PATH}`, { headers }).then((response) =>
      response.json(),
    )) as GrantEvents;
    const events = reports.items.filter((event: GrantEvent) => eventClientId(event) === "new-app");
    expect(events).toEqual(
      daysBefore === 181
        ? []
        : [
            expect.objectContaining({
              id: expect.objectContaining({ time: grantedAt }),
              actor: expect.objectContaining({ email: "ana@acme.example" }),
            }),
          ],
    );
  },
);

it("deletes a person's grant from Directory tokens", async ({ fake }) => {
  const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });
  const grant = ACME.grants.find((candidate) => candidate.email === "ana@acme.example")!;

  await control(fake.url, "/grants", { email: grant.email, clientId: grant.clientId }, "DELETE");

  const response = await fetch(`${fake.url}/admin/directory/v1/users/${grant.email}/tokens`, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as DirectoryTokens;
  expect(body.items.map((token: DirectoryToken) => token.clientId).sort()).toEqual(
    ACME.grants
      .filter(
        (candidate) => candidate.email === grant.email && candidate.clientId !== grant.clientId,
      )
      .map((candidate) => candidate.clientId)
      .sort(),
  );
});

it("resets modified people and grants to the seed", async ({ fake }) => {
  await control(fake.url, "/users/chloe@acme.example/suspend");
  await control(fake.url, "/grants", {
    email: "ana@acme.example",
    clientId: "new-app",
    appName: "New app",
  });
  const grant = ACME.grants[0]!;
  await control(fake.url, "/grants", { email: grant.email, clientId: grant.clientId }, "DELETE");

  await control(fake.url, "/reset");

  expect(await fetch(`${fake.url}/_fake/state`).then((response) => response.json())).toEqual(
    SEED_STATE,
  );
  const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });
  const headers = { authorization: `Bearer ${tokens.access_token}` };
  const users = (await fetch(`${fake.url}${USERS_PATH}`, { headers }).then((response) =>
    response.json(),
  )) as DirectoryUsers;
  expect(
    users.users.find((person: DirectoryUser) => person.primaryEmail === "chloe@acme.example")
      ?.suspended,
  ).toBe(false);
  const grants = (await fetch(`${fake.url}/admin/directory/v1/users/${grant.email}/tokens`, {
    headers,
  }).then((response) => response.json())) as DirectoryTokens;
  expect(grants.items).toContainEqual(expect.objectContaining({ clientId: grant.clientId }));
});

it("clears queued failures on reset", async ({ fake }) => {
  await control(fake.url, "/failures", {
    endpoint: "directory.users.list",
    error: "app_unavailable",
    count: 2,
  });

  await control(fake.url, "/reset");

  const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });
  const response = await fetch(`${fake.url}${USERS_PATH}`, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  expect(response.status).toBe(200);
});

it("revokes every refresh token", async ({ fake }) => {
  const first = await signIn(fake.url, { access_type: "offline" });
  const second = await signIn(fake.url, { access_type: "offline", prompt: "consent" });

  await control(fake.url, "/tokens/revoke");

  for (const tokens of [first, second]) {
    const response = await refreshAccessToken(fake.url, tokens.refresh_token!);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid_grant",
      error_description: "Token has been expired or revoked.",
    });
  }
});

it("allows newly issued refresh tokens after resetting revoked tokens", async ({ fake }) => {
  await signIn(fake.url, { access_type: "offline" });
  await control(fake.url, "/tokens/revoke");

  await control(fake.url, "/reset");

  const tokens = await signIn(fake.url, { access_type: "offline" });
  expect(tokens.refresh_token).toEqual(expect.any(String));
  expect((await refreshAccessToken(fake.url, tokens.refresh_token!)).status).toBe(200);
});

it("registers another client with its own redirect address and display name", async ({ fake }) => {
  const client = {
    clientId: "registered-client",
    clientSecret: "registered-secret",
    redirectUris: ["http://localhost:3001/callback"],
  };

  await control(fake.url, "/clients", client);

  const params = authorizationParams({
    client_id: client.clientId,
    redirect_uri: client.redirectUris[0]!,
  });
  const page = await fetch(`${fake.url}/o/oauth2/v2/auth?${params.toString()}`);
  expect(page.status).toBe(200);
  expect(await page.text()).toContain(client.clientId);
  const tokens = await signIn(fake.url, {
    client_id: client.clientId,
    client_secret: client.clientSecret,
    redirect_uri: client.redirectUris[0]!,
  });
  expect(tokens.access_token).toEqual(expect.any(String));
});

it("forgets registered clients on reset", async ({ fake }) => {
  await control(fake.url, "/clients", {
    clientId: "registered-client",
    clientSecret: "registered-secret",
    redirectUris: ["http://localhost:3001/callback"],
  });

  await control(fake.url, "/reset");

  const params = authorizationParams({
    client_id: "registered-client",
    redirect_uri: "http://localhost:3001/callback",
  });
  const response = await fetch(`${fake.url}/o/oauth2/v2/auth?${params.toString()}`, {
    redirect: "manual",
  });
  expect(response.status).toBe(401);
  expect(await response.text()).toContain("invalid_client");
});

it("reports only public fields of created users until reset", async ({ fake }) => {
  const { access_token } = await signIn(fake.url, { scope: USER_WRITE_SCOPE });
  expect((await insertGoogleUser(fake.url, access_token)).status).toBe(200);
  expect((await updateGoogleUser(fake.url, access_token, NEW_USER.primaryEmail, true)).status).toBe(
    200,
  );

  const response = await fetch(`${fake.url}/_fake/state`);
  const state = (await response.json()) as FakeState;
  expect(state.createdUsers).toEqual([
    { primaryEmail: NEW_USER.primaryEmail, suspended: true, changePasswordAtNextLogin: false },
  ]);
  expect(JSON.stringify(state)).not.toContain(NEW_USER.password);
  expect(JSON.stringify(state)).not.toContain('"password"');

  await control(fake.url, "/reset");
  expect(await (await fetch(`${fake.url}/_fake/state`)).json()).toMatchObject({ createdUsers: [] });
});

it("deletes a user from the directory and returns 404 when it is already gone", async ({
  fake,
}) => {
  const { access_token } = await signIn(fake.url, { scope: ADMIN_SCOPES });
  const email = "chloe@acme.example";

  await control(fake.url, `/users/${email}/delete`);

  const response = await fetch(`${fake.url}${USERS_PATH}&maxResults=100`, {
    headers: { authorization: `Bearer ${access_token}` },
  });
  expect(response.status).toBe(200);
  const { users } = (await response.json()) as DirectoryUsers;
  expect(users).toHaveLength(ACME.people.length - 1);
  expect(users.map(({ primaryEmail }) => primaryEmail)).not.toContain(email);
  expect((await fetch(`${fake.url}/_fake/users/${email}/delete`, { method: "POST" })).status).toBe(
    404,
  );
});

it("invalidates a deleted user's access and refresh tokens", async ({ fake }) => {
  const email = "chloe@acme.example";
  const tokens = await signIn(fake.url, { account: email, access_type: "offline" });
  const headers = { authorization: `Bearer ${tokens.access_token}` };
  expect((await fetch(`${fake.url}/v1/userinfo`, { headers })).status).toBe(200);
  expect(tokens.refresh_token).toBeTruthy();

  await control(fake.url, `/users/${email}/delete`);

  expect((await fetch(`${fake.url}/v1/userinfo`, { headers })).status).toBe(401);
  const refreshed = await refreshAccessToken(fake.url, tokens.refresh_token!);
  expect(refreshed.status).toBe(400);
  expect(await refreshed.json()).toMatchObject({ error: "invalid_grant" });
});

const SEED_STATE = {
  createdUsers: [],
  people: 42,
  suspendedPeople: 2,
  apps: 37,
  grants: ACME.grants.length,
  events: 27,
};
