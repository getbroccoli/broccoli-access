import { expect, test, pairChrome, redeemCode, START_PAIRING, BROWSER } from "#test/support";

test("the owner and the paired Chrome see the same pairing", async ({ env }) => {
  const { browser, token } = await pairChrome(env);

  const response = await fetch(new URL("/api/extension/pairing", env.url), {
    headers: { authorization: `Bearer ${token}` },
  });

  expect(response.status).toBe(200);
  const pairing = (await response.json()) as { browser: string; pairedAt: string };
  expect(pairing).toEqual({ browser: BROWSER, pairedAt: expect.any(String) as unknown });
  expect(new Date(pairing.pairedAt).toISOString()).toBe(pairing.pairedAt);
  expect(await (await browser.graphql(MY_PAIRING)).json()).toEqual({
    data: { me: { extensionPairing: pairing } },
  });
});

test("refuses to start pairing without a session", async ({ env }) => {
  const response = await env.browser().graphql(START_PAIRING);

  expect(await response.json()).toHaveProperty("errors.0.extensions.code", "UNAUTHENTICATED");
});

test.for(["GET", "DELETE"])("refuses %s with the wrong token", async (method, { env }) => {
  const response = await fetch(new URL("/api/extension/pairing", env.url), {
    method,
    headers: { authorization: "Bearer unknown" },
  });

  expect(response.status).toBe(401);
});

test.for(["GET", "DELETE"])("refuses %s without a token", async (method, { env }) => {
  const response = await fetch(new URL("/api/extension/pairing", env.url), { method });

  expect(response.status).toBe(401);
});

test("unpairing in Settings revokes the extension's access", async ({ env }) => {
  const { browser, token } = await pairChrome(env);

  const unpaired = await browser.graphql(
    "mutation { extension { unpair { user { extensionPairing { browser } } } } }",
  );

  expect(await unpaired.json()).toEqual({
    data: { extension: { unpair: { user: { extensionPairing: null } } } },
  });
  const response = await fetch(new URL("/api/extension/pairing", env.url), {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(response.status).toBe(401);
  expect(await (await browser.graphql(MY_PAIRING)).json()).toEqual({
    data: { me: { extensionPairing: null } },
  });
});

test("unpairing from Chrome removes the pairing from Settings", async ({ env }) => {
  const { browser, token } = await pairChrome(env);

  const response = await fetch(new URL("/api/extension/pairing", env.url), {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });

  expect(response.status).toBe(204);
  expect(await (await browser.graphql(MY_PAIRING)).json()).toEqual({
    data: { me: { extensionPairing: null } },
  });
});

test("returns the code field error when Chrome redeems a bad code", async ({ env }) => {
  const response = await redeemCode(env, "never-issued");

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "code", code: "invalid" }],
  });
});

test("refuses a JSON array as a pairing request", async ({ env }) => {
  const response = await env.browser().post("/api/extension/pairings", []);

  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: "INVALID_INPUT" });
});

test("returns INVALID_INPUT when a pairing request contains malformed JSON", async ({ env }) => {
  const response = await fetch(new URL("/api/extension/pairings", env.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"code": "abc',
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: "INVALID_INPUT" });
});

test("refuses an app-session request whose connector has an invalid percent escape", async ({
  env,
}) => {
  const response = await fetch(new URL("/api/extension/app-sessions/%E0%A4%A", env.url));

  expect(response.status).toBe(400);
});

const MY_PAIRING = "{ me { extensionPairing { browser pairedAt } } }";
