import { expect, test } from "#test/support";

test("answers the ping query with pong", async ({ env }) => {
  const response = await env.browser().graphql("{ ping }");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: { ping: "pong" } });
});

test("answers the public fields without a session", async ({ env }) => {
  const response = await env.browser().graphql("{ ping setup { id step } me { id } }");

  expect(await response.json()).toEqual({
    data: { ping: "pong", setup: { id: "instance", step: "CONNECT_GOOGLE" }, me: null },
  });
});

test("rejects introspection with a validation error", async ({ env }) => {
  const response = await env.browser().graphql("{ __schema { types { name } } }");

  expect(response.status).toBe(400);
  expect(await response.json()).toHaveProperty(
    "errors.0.extensions.code",
    "GRAPHQL_VALIDATION_FAILED",
  );
});

test("refuses a malformed body as invalid input without echoing it", async ({ env }) => {
  const response = await fetch(new URL("/api/graphql", env.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"query": "{ ping }", "variables": {"apiKey": "lin_api_pasted_secret',
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "body", code: "invalid" }],
  });
});
