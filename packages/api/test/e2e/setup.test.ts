import { expect, test, TEST_OWNER } from "#test/support";

test("a fresh instance opens setup at the owner step", async ({ env }) => {
  const browser = env.browser();

  const response = await browser.graphql("{ me { id } setup { id step holder } }");

  expect(await response.json()).toEqual({
    data: {
      me: null,
      setup: { id: "instance", step: "OWNER", holder: "NOBODY" },
    },
  });
});

test("creating the owner signs them in and finishes setup", async ({ env }) => {
  const browser = await env.startSetup();

  const response = await browser.post("/api/auth/setup", TEST_OWNER);

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ user: { email: TEST_OWNER.email } });
  expect(sessionCookieOf(response)).toBeDefined();
  expect(
    response.headers.getSetCookie().find((cookie) => cookie.startsWith("broccoli_access_setup=")),
  ).toMatch(/;\s*Max-Age=0(?:;|$)/i);
});

test("the owner stays signed in on the next request", async ({ env }) => {
  const browser = await env.startSetup();
  const created = await browser.post("/api/auth/setup", TEST_OWNER);
  const { user } = (await created.json()) as { user: { id: string } };

  const signedIn = await browser.graphql("{ me { id email isOwner } setup { id step holder } }");

  expect(await signedIn.json()).toEqual({
    data: {
      me: { id: user.id, email: TEST_OWNER.email, isOwner: true },
      setup: { id: "instance", step: "DONE", holder: "NOBODY" },
    },
  });
  const session = await browser.get("/api/auth/get-session");
  expect(session.status).toBe(200);
  expect(await session.json()).toMatchObject({ user: { id: user.id, email: TEST_OWNER.email } });
});

function sessionCookieOf(response: Response): string | undefined {
  return response.headers
    .getSetCookie()
    .find((cookie) => cookie.includes("session_token="))
    ?.split(";", 1)[0];
}
