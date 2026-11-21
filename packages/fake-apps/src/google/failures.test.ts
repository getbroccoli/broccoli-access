import { expect } from "vitest";

import {
  ADMIN_SCOPES,
  CUSTOMER_PATH,
  control,
  REPORTS_PATH,
  schemaViolations,
  signIn,
  test as it,
  USERS_PATH,
} from "#test/support";

it.for(
  [
    {
      endpoint: "directory.customers.get",
      path: CUSTOMER_PATH,
      api: "directory",
      schema: "Customer",
    },
    { endpoint: "directory.users.list", path: USERS_PATH, api: "directory", schema: "Users" },
    {
      endpoint: "directory.tokens.list",
      path: "/admin/directory/v1/users/ana@acme.example/tokens",
      api: "directory",
      schema: "Tokens",
    },
    {
      endpoint: "reports.activities.list",
      path: REPORTS_PATH,
      api: "reports",
      schema: "Activities",
    },
  ].flatMap((endpoint) =>
    [
      { error: "authentication_failed", status: 401, reason: "UNAUTHENTICATED" },
      { error: "permission_missing", status: 403, reason: "insufficientPermissions" },
      { error: "rate_limited", status: 429, reason: "rateLimitExceeded" },
      { error: "app_unavailable", status: 503, reason: "backendError" },
      { error: "unexpected_response", status: 200, reason: "invalid schema" },
    ].map((failure) => ({ ...endpoint, ...failure })),
  ),
)(
  "injects $error into exactly two calls to $endpoint",
  async ({ endpoint, path, api, schema, error, status, reason }, { fake }) => {
    const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });
    const headers = { authorization: `Bearer ${tokens.access_token}` };
    await control(fake.url, "/failures", { endpoint, error, count: 2 });

    for (let call = 0; call < 2; call++) {
      const response = await fetch(`${fake.url}${path}`, { headers });
      expect(response.status).toBe(status);
      const body = await response.json();
      if (error === "unexpected_response")
        expect(
          schemaViolations(api as "directory" | "reports", schema, body).length,
        ).toBeGreaterThan(0);
      else if (error === "authentication_failed")
        expect(body).toMatchObject({ error: { status: reason } });
      else expect(body).toMatchObject({ error: { errors: [{ reason }] } });
    }

    const response = await fetch(`${fake.url}${path}`, { headers });
    expect(response.status).toBe(200);
    expect(schemaViolations(api as "directory" | "reports", schema, await response.json())).toEqual(
      [],
    );
  },
);

it("keeps a queued failure scoped to its endpoint", async ({ fake }) => {
  const tokens = await signIn(fake.url, { scope: ADMIN_SCOPES });
  const headers = { authorization: `Bearer ${tokens.access_token}` };
  await control(fake.url, "/failures", {
    endpoint: "directory.users.list",
    error: "rate_limited",
    count: 1,
  });

  const unrelated = await fetch(`${fake.url}${CUSTOMER_PATH}`, { headers });
  const targeted = await fetch(`${fake.url}${USERS_PATH}`, { headers });

  expect(unrelated.status).toBe(200);
  expect(targeted.status).toBe(429);
});
