/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Vitest asymmetric matchers return any. */
import { expect } from "vitest";

import {
  ADMIN_SCOPES,
  insertGoogleUser,
  updateGoogleUser,
  USER_WRITE_SCOPE,
  CUSTOMER_PATH,
  control,
  refreshAccessToken,
  REPORTS_PATH,
  schemaViolations,
  signIn,
  test as it,
  USERS_PATH,
  type TestFakeGoogle,
} from "#test/support";
import { ACME } from "../seed";
import openidConfiguration from "./discovery/openidConfiguration.json";

it.for([
  "seed",
  "suspend",
  "add grant",
  "delete grant",
  "own-client consent",
  "changed photo",
  "removed photo",
])("conforms to Google's Directory and Reports schemas after %s", async (change, { fake }) => {
  const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });
  await changeState(fake, change);
  const peopleWithPhotos = ACME.people.filter(({ photo }) => photo !== null);
  expect(peopleWithPhotos).toHaveLength(11);
  const endpoints = [
    { path: CUSTOMER_PATH, api: "directory", schema: "Customer" },
    { path: `${USERS_PATH}&projection=full`, api: "directory", schema: "Users" },
    { path: `${USERS_PATH}&maxResults=10`, api: "directory", schema: "Users" },
    { path: REPORTS_PATH, api: "reports", schema: "Activities" },
    { path: `${REPORTS_PATH}&maxResults=5`, api: "reports", schema: "Activities" },
    ...ACME.people.map((person) => ({
      path: `/admin/directory/v1/users/${person.id}/tokens`,
      api: "directory",
      schema: "Tokens",
    })),
    ...peopleWithPhotos
      .filter(({ email }) => change !== "removed photo" || email !== "ana@acme.example")
      .map((person) => ({
        path: `/admin/directory/v1/users/${person.id}/photos/thumbnail`,
        api: "directory",
        schema: "UserPhoto",
      })),
  ];

  for (const { path, api, schema } of endpoints) {
    const response = await fetch(`${fake.url}${path}`, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(response.status, path).toBe(200);
    expect(
      schemaViolations(api as "directory" | "reports", schema, await response.json()),
      path,
    ).toEqual([]);
  }
});

it.for(["insert", "update"] as const)(
  "returns a Directory User for users.%s",
  async (method, { fake }) => {
    const { access_token } = await signIn(fake.url, { scope: USER_WRITE_SCOPE });

    const response =
      method === "insert"
        ? await insertGoogleUser(fake.url, access_token)
        : await updateGoogleUser(fake.url, access_token, "chloe@acme.example", true);

    expect(response.status).toBe(200);
    expect(schemaViolations("directory", "User", await response.json())).toEqual([]);
  },
);

it("publishes only Google's OpenID keys and supported values", async ({ fake }) => {
  const response = await fetch(`${fake.url}/.well-known/openid-configuration`);

  expect(response.status).toBe(200);
  const body = (await response.json()) as Record<string, unknown>;
  const google: Record<string, unknown> = openidConfiguration;
  for (const [key, value] of Object.entries(body)) {
    expect(google, key).toHaveProperty(key);
    if (Array.isArray(google[key])) {
      expect(Array.isArray(value), key).toBe(true);
      for (const item of value as unknown[]) expect(google[key], key).toContain(item);
    }
  }
  expect(body).toMatchObject({
    issuer: "https://accounts.google.com",
    response_types_supported: expect.arrayContaining(["code"]),
    subject_types_supported: expect.arrayContaining(["public"]),
    id_token_signing_alg_values_supported: expect.arrayContaining(["RS256"]),
    scopes_supported: expect.arrayContaining(["openid", "email", "profile"]),
    token_endpoint_auth_methods_supported: expect.arrayContaining([
      "client_secret_post",
      "client_secret_basic",
    ]),
  });
});

it.for(["online", "offline", "refresh"])(
  "returns only Google's token response fields for %s",
  async (flow, { fake }) => {
    const tokens = await signIn(fake.url, flow === "online" ? {} : { access_type: "offline" });

    const body =
      flow === "refresh"
        ? ((await (await refreshAccessToken(fake.url, tokens.refresh_token!)).json()) as Record<
            string,
            unknown
          >)
        : tokens;

    const allowed = [
      "access_token",
      "expires_in",
      "refresh_token",
      "scope",
      "token_type",
      "id_token",
    ];
    for (const key of Object.keys(body)) expect(allowed).toContain(key);
    expect(body).toMatchObject({
      access_token: expect.any(String),
      expires_in: 3599,
      scope: expect.any(String),
      token_type: "Bearer",
    });
  },
);

async function changeState(fake: TestFakeGoogle, change: string): Promise<void> {
  const { url } = fake;
  switch (change) {
    case "changed photo":
      fake.setPhoto(
        "ana@acme.example",
        ACME.people.find(({ email }) => email === "ben@acme.example")!.photo,
      );
      return;
    case "removed photo":
      fake.setPhoto("ana@acme.example", null);
      return;
    case "suspend":
      await control(url, "/users/chloe@acme.example/suspend");
      return;
    case "add grant":
      await control(url, "/grants", {
        email: "ana@acme.example",
        clientId: "new-app",
        appName: "New app",
      });
      return;
    case "delete grant": {
      const grant = ACME.grants.find((candidate) => candidate.email === "ben@acme.example")!;
      await control(url, "/grants", { email: grant.email, clientId: grant.clientId }, "DELETE");
      return;
    }
    case "own-client consent":
      await signIn(url, { account: "chloe@acme.example" });
      return;
  }
}
