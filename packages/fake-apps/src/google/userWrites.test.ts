import { expect } from "vitest";

import {
  ADMIN_SCOPES,
  NEW_USER,
  USER_WRITE_SCOPE,
  USERS_PATH,
  control,
  insertGoogleUser,
  signIn,
  test as it,
  updateGoogleUser,
  type DirectoryUser,
  type DirectoryUsers,
} from "#test/support";
import { ACME } from "../seed";

it("creates a directory user and immediately lists it without its password", async ({ fake }) => {
  const { access_token } = await signIn(fake.url, { scope: `${ADMIN_SCOPES} ${USER_WRITE_SCOPE}` });

  const response = await insertGoogleUser(fake.url, access_token);

  expect(response.status).toBe(200);
  const user = (await response.json()) as DirectoryUser;
  expect(user).toMatchObject({
    kind: "admin#directory#user",
    id: expect.stringMatching(/.+/) as unknown,
    primaryEmail: NEW_USER.primaryEmail,
    name: { ...NEW_USER.name, fullName: "Broccoli Access" },
    isAdmin: false,
    suspended: false,
    changePasswordAtNextLogin: false,
    orgUnitPath: "/",
    customerId: ACME.customer.id,
    creationTime: fake.now.toISOString(),
  });
  expect(ACME.people.map(({ id }) => id)).not.toContain(user.id);
  expect(user).not.toHaveProperty("password");
  expect(JSON.stringify(user)).not.toContain(NEW_USER.password);
  const listed = await fetch(`${fake.url}${USERS_PATH}&maxResults=100`, {
    headers: { authorization: `Bearer ${access_token}` },
  });
  expect(listed.status).toBe(200);
  const { users } = (await listed.json()) as DirectoryUsers;
  expect(users.find(({ id }) => id === user.id)).toMatchObject({
    primaryEmail: NEW_USER.primaryEmail,
  });
  expect(JSON.stringify(users)).not.toContain(NEW_USER.password);
});

it.for([
  ["an existing email", { ...NEW_USER, primaryEmail: "ana@acme.example" }, 409, "duplicate"],
  ["another domain", { ...NEW_USER, primaryEmail: "broccoli@other.example" }, 400, "invalid"],
  ["a missing email", { ...NEW_USER, primaryEmail: undefined }, 400, "invalid"],
  ["a missing given name", { ...NEW_USER, name: { familyName: "Access" } }, 400, "invalid"],
  ["a missing family name", { ...NEW_USER, name: { givenName: "Broccoli" } }, 400, "invalid"],
  ["a missing password", { ...NEW_USER, password: undefined }, 400, "invalid"],
] as const)("rejects %s on creation", async ([, body, status, reason], { fake }) => {
  const { access_token } = await signIn(fake.url, { scope: USER_WRITE_SCOPE });

  const response = await insertGoogleUser(fake.url, access_token, body);

  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ error: { errors: [{ reason }] } });
});

it("accepts a user without a mandatory password change setting", async ({ fake }) => {
  const { access_token } = await signIn(fake.url, { scope: USER_WRITE_SCOPE });

  const response = await insertGoogleUser(fake.url, access_token, {
    ...NEW_USER,
    changePasswordAtNextLogin: undefined,
  });

  expect(response.status).toBe(200);
});

it("suspends a user by id and restores the same user by email", async ({ fake }) => {
  const { access_token } = await signIn(fake.url, { scope: `${ADMIN_SCOPES} ${USER_WRITE_SCOPE}` });
  const person = ACME.people.find(({ email }) => email === "chloe@acme.example")!;

  for (const [key, suspended] of [
    [person.id, true],
    [person.email, false],
  ] as const) {
    const response = await updateGoogleUser(fake.url, access_token, key, suspended);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: person.id,
      primaryEmail: person.email,
      suspended,
    });
    const listed = await fetch(`${fake.url}${USERS_PATH}`, {
      headers: { authorization: `Bearer ${access_token}` },
    });
    const { users } = (await listed.json()) as DirectoryUsers;
    expect(users.find(({ id }) => id === person.id)?.suspended).toBe(suspended);
  }
});

it("rejects updates to an unknown user", async ({ fake }) => {
  const { access_token } = await signIn(fake.url, { scope: USER_WRITE_SCOPE });

  const response = await updateGoogleUser(fake.url, access_token, "missing@acme.example", true);

  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ error: { errors: [{ reason: "notFound" }] } });
});

it.for(["insert", "update"] as const)(
  "requires write permission for %s",
  async (method, { fake }) => {
    const { access_token } = await signIn(fake.url, { scope: ADMIN_SCOPES });

    const response = await writeUser(fake.url, access_token, method);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { errors: [{ reason: "insufficientPermissions" }] },
    });
  },
);

it.for(["insert", "update"] as const)(
  "applies a planned failure to directory.users.%s",
  async (method, { fake }) => {
    const { access_token } = await signIn(fake.url, { scope: USER_WRITE_SCOPE });
    await control(fake.url, "/failures", {
      endpoint: `directory.users.${method}`,
      error: "app_unavailable",
      count: 1,
    });

    expect((await writeUser(fake.url, access_token, method)).status).toBe(503);
    expect((await writeUser(fake.url, access_token, method)).status).toBe(200);
  },
);

function writeUser(url: string, token: string, method: "insert" | "update") {
  return method === "insert"
    ? insertGoogleUser(url, token)
    : updateGoogleUser(url, token, "chloe@acme.example", true);
}
