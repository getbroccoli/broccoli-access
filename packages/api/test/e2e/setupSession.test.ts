import { ACME } from "@broccoli-access/fake-apps";
import { request } from "node:http";

import {
  createBrowser,
  expect,
  test,
  consentAtGoogle,
  registerGoogleRedirect,
} from "#test/support";

test("the first browser starts setup with a private three-day cookie", async ({ env }) => {
  const browser = env.browser();
  const offered = await browser.post("/api/auth/setup/start", undefined);
  expect(offered.status).toBe(200);
  expect(await offered.json()).toEqual({ holder: "nobody" });

  const response = await browser.post("/api/auth/setup/start", undefined);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ holder: "you" });
  const cookie = setupCookieOf(response);
  expect(cookie!.split(";", 1)[0]).toBe(setupCookieOf(offered)!.split(";", 1)[0]);
  expect(cookie).toMatch(/^broccoli_access_setup=[^;]+;/);
  expect(cookie).toMatch(/;\s*Max-Age=259200(?:;|$)/i);
  expect(cookie).toMatch(/;\s*Path=\/(?:;|$)/i);
  expect(cookie).toMatch(/;\s*HttpOnly(?:;|$)/i);
  expect(cookie).toMatch(/;\s*SameSite=Lax(?:;|$)/i);
  expect(cookie).not.toMatch(/;\s*Secure(?:;|$)/i);
  const setup = await browser.graphql("query { setup { id holder } }");
  expect(await setup.json()).toEqual({ data: { setup: { id: "instance", holder: "YOU" } } });
});

test("a lost first setup answer leaves setup free for a fresh browser", async ({ env }) => {
  const lost = await fetch(`${env.url}/api/auth/setup/start`, {
    method: "POST",
    headers: { origin: env.url },
  });
  expect(lost.status).toBe(200);

  const browser = await env.startSetup();

  const setup = await browser.graphql("query { setup { holder } }");
  expect(await setup.json()).toEqual({ data: { setup: { holder: "YOU" } } });
});

test("a second browser is refused setup and private access", async ({ env }) => {
  await env.startSetup();
  const another = env.browser();

  const response = await another.post("/api/auth/setup/start", undefined);

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "SETUP_IN_PROGRESS" });
  const setup = await another.graphql("query { setup { id holder } }");
  expect(await setup.json()).toEqual({
    data: { setup: { id: "instance", holder: "ANOTHER_DEVICE" } },
  });
  const employees = await another.graphql("query { employees { edges { node { id } } } }");
  expect(await employees.json()).toMatchObject({
    errors: [{ extensions: { code: "UNAUTHENTICATED" } }],
  });
});

test("the setup cookie grants no access to employees", async ({ env }) => {
  const browser = await env.startSetup();

  const response = await browser.graphql("query { employees { edges { node { id } } } }");

  expect(await response.json()).toMatchObject({ errors: [{ extensions: { code: "FORBIDDEN" } }] });
});

test("connecting Google ends the setup cookie's access", async ({ env, fakeGoogle }) => {
  await registerGoogleRedirect(fakeGoogle.url, env.url);
  const browser = await env.startSetup();
  const started = await browser.post("/api/auth/setup/start", undefined);
  const oldCookie = setupCookieOf(started)!.split(";", 1)[0]!;

  const connection = await browser.post("/api/google/connect", ACME.oauthClient);
  const { authorizationUrl } = (await connection.json()) as { authorizationUrl: string };
  const callback = await consentAtGoogle(authorizationUrl);
  await browser.getManual(callback.href);

  const stale = await fetch(`${env.url}/api/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: oldCookie },
    body: JSON.stringify({ query: "query { employees { edges { node { id } } } }" }),
  });
  expect(await stale.json()).toMatchObject({
    errors: [{ extensions: { code: "UNAUTHENTICATED" } }],
  });
});

test("renews the setup cookie when the holder starts again", async ({ env }) => {
  const browser = env.browser();
  await browser.post("/api/auth/setup/start", undefined);
  const first = await browser.post("/api/auth/setup/start", undefined);

  const renewed = await browser.post("/api/auth/setup/start", undefined);

  expect(renewed.status).toBe(200);
  expect(setupCookieOf(renewed)!.split(";", 1)[0]).toBe(setupCookieOf(first)!.split(";", 1)[0]);
  expect(setupCookieOf(renewed)).toMatch(/;\s*Max-Age=259200(?:;|$)/i);
});

test("refuses setup start once an owner exists", async ({ env }) => {
  await env.signInAsOwner();

  const response = await env.browser().post("/api/auth/setup/start", undefined);

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "OWNER_EXISTS" });
});

test("sets a Secure setup cookie when the public URL uses HTTPS", async ({ env }) => {
  await env.restart({ publicUrl: "https://access.example.com" });

  const response = await createBrowser(env.url, "https://access.example.com").post(
    "/api/auth/setup/start",
    undefined,
  );

  expect(response.status).toBe(200);
  expect(setupCookieOf(response)).toMatch(/;\s*Secure(?:;|$)/i);
});

test("keeps the owner's session across a restart", async ({ env }) => {
  const { browser, user } = await env.signInAsOwner();

  await env.restart();

  const session = await browser.get(`${env.url}/api/auth/get-session`);
  expect(session.status).toBe(200);
  expect(await session.json()).toMatchObject({ user });
});

test("refuses a setup start from another origin without cookies and leaves setup unclaimed", async ({
  env,
}) => {
  const response = await fetch(`${env.url}/api/auth/setup/start`, {
    method: "POST",
    headers: { origin: "https://other.example.com" },
  });

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "cross_origin" });
  const setup = await env.browser().graphql("query { setup { id holder } }");
  expect(await setup.json()).toEqual({ data: { setup: { id: "instance", holder: "NOBODY" } } });
});

test("refuses a raw dot-segment setup start from another origin without cookies and leaves setup unclaimed", async ({
  env,
}) => {
  const status = await new Promise<number | undefined>((resolve, reject) => {
    const req = request(
      env.url,
      {
        method: "POST",
        path: "/api/auth/setup/./start",
        headers: { origin: "https://other.example.com" },
      },
      (response) => {
        response.on("error", reject);
        response.on("end", () => resolve(response.statusCode));
        response.resume();
      },
    );
    req.on("error", reject);
    req.end();
  });

  expect(status).toBe(403);
  const setup = await env.browser().graphql("query { setup { id holder } }");
  expect(await setup.json()).toEqual({ data: { setup: { id: "instance", holder: "NOBODY" } } });
});

test("refuses a setup start without an Origin header", async ({ env }) => {
  const response = await fetch(`${env.url}/api/auth/setup/start`, { method: "POST" });

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "cross_origin" });
});

test("refuses the eleventh setup start even when each request changes X-Forwarded-For", async ({
  env,
}) => {
  for (let request = 0; request < 10; request++) {
    const response = await fetch(`${env.url}/api/auth/setup/start`, {
      method: "POST",
      headers: { origin: env.url, "x-forwarded-for": `192.0.2.${request + 1}` },
    });
    expect(response.status).toBe(200);
  }

  const response = await fetch(`${env.url}/api/auth/setup/start`, {
    method: "POST",
    headers: { origin: env.url, "x-forwarded-for": "192.0.2.11" },
  });

  expect(response.status).toBe(429);
});

function setupCookieOf(response: Response): string | undefined {
  return response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("broccoli_access_setup="));
}
