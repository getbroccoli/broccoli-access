import { expect } from "vitest";

import {
  ADMIN_SCOPES,
  CUSTOMER_PATH,
  control,
  REPORTS_PATH,
  signIn,
  test as it,
  USERS_PATH,
} from "#test/support";
import directory from "./discovery/directoryV1.json";
import reports from "./discovery/reportsV1.json";

it.for([
  CUSTOMER_PATH,
  USERS_PATH,
  "/admin/directory/v1/users/ana@acme.example/tokens",
  REPORTS_PATH,
])("rejects unknown tokens before checking permissions at %s", async (path, { fake }) => {
  const response = await fetch(`${fake.url}${path}`, {
    headers: { authorization: "Bearer unknown-token" },
  });

  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ error: { status: "UNAUTHENTICATED" } });
});

it.for([
  CUSTOMER_PATH,
  USERS_PATH,
  "/admin/directory/v1/users/ana@acme.example/tokens",
  REPORTS_PATH,
])(
  "rejects expired tokens before missing scopes or non-admin status at %s",
  async (path, { fake }) => {
    const tokens = await signIn(fake.url, { account: "chloe@acme.example" });
    fake.now = new Date(fake.now.getTime() + tokens.expires_in * 1000);

    const response = await fetch(`${fake.url}${path}`, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { status: "UNAUTHENTICATED" } });
  },
);

it.for([
  CUSTOMER_PATH,
  USERS_PATH,
  "/admin/directory/v1/users/ana@acme.example/tokens",
  REPORTS_PATH,
])("rejects a missing scope before non-admin status at %s", async (path, { fake }) => {
  const tokens = await signIn(fake.url, { account: "chloe@acme.example" });

  const response = await fetch(`${fake.url}${path}`, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });

  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({
    error: { errors: [{ reason: "insufficientPermissions" }] },
  });
});

it.for([
  CUSTOMER_PATH,
  USERS_PATH,
  "/admin/directory/v1/users/ana@acme.example/tokens",
  REPORTS_PATH,
])("rejects a scoped account that is not a super admin at %s", async (path, { fake }) => {
  const tokens = await signIn(fake.url, { account: "chloe@acme.example", scope: ADMIN_SCOPES });

  const response = await fetch(`${fake.url}${path}`, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });

  expect(response.status).toBe(403);
  const body = await response.json();
  expect(body).toMatchObject({
    error: {
      errors: [{ reason: "forbidden" }],
      message: "Not Authorized to access this resource/api",
    },
  });
});

it.for([
  ...directory.resources.customers.methods.get.scopes.map((scope) => ({
    path: CUSTOMER_PATH,
    scope,
  })),
  ...directory.resources.users.methods.list.scopes.map((scope) => ({ path: USERS_PATH, scope })),
  ...directory.resources.tokens.methods.list.scopes.map((scope) => ({
    path: "/admin/directory/v1/users/ana@acme.example/tokens",
    scope,
  })),
  ...reports.resources.activities.methods.list.scopes.map((scope) => ({
    path: REPORTS_PATH,
    scope,
  })),
])("accepts the discovery scope $scope at $path", async ({ path, scope }, { fake }) => {
  const tokens = await signIn(fake.url, { scope: `openid email profile ${scope}` });

  const response = await fetch(`${fake.url}${path}`, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });

  expect(response.status).toBe(200);
});

it("expires every issued access token through the control endpoint", async ({ fake }) => {
  const first = await signIn(fake.url, { scope: ADMIN_SCOPES });
  const second = await signIn(fake.url, { scope: ADMIN_SCOPES });

  await control(fake.url, "/tokens/expire");

  for (const tokens of [first, second]) {
    const response = await fetch(`${fake.url}${USERS_PATH}`, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { status: "UNAUTHENTICATED" } });
  }
});
