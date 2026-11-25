import { ACME } from "@broccoli-access/fake-apps";

import { expect, finishSetupWithDemoApps, test, type Browser } from "#test/support";

test("reads a suspended person's app accounts through the API", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  await finishSetupWithDemoApps(browser);
  const people = await browser.graphql(`{
    employees(filter: { search: "ana@acme.example" }) { edges { node { id } } }
  }`);
  const { data } = (await people.json()) as {
    data: { employees: { edges: { node: { id: string } }[] } };
  };
  const { id } = data.employees.edges[0]!.node;

  const response = await browser.graphql(
    `query ($id: ID!) {
      employee(id: $id) {
        id status suspendedWithAccess
        appAccounts { app { name catalogKey } foundVia since { at before } }
      }
    }`,
    { id },
  );

  expect(await response.json()).toEqual({
    data: {
      employee: {
        id,
        status: "SUSPENDED",
        suspendedWithAccess: true,
        appAccounts: ["Figma", "Notion", "Slack"].map((appName) => ({
          app: { name: appName, catalogKey: appName.toLowerCase() },
          foundVia: ["google_sign_in"],
          since: {
            at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/) as unknown,
            before: true,
          },
        })),
      },
    },
  });
});

test("refuses a person's app accounts without a session", async ({ env }) => {
  await env.signInAsOwner();
  const employee = await env.seed.employee();

  const response = await env
    .browser()
    .graphql(`query ($id: ID!) { employee(id: $id) { appAccounts { app { name } } } }`, {
      id: employee.id,
    });

  expect(await response.json()).toHaveProperty("errors.0.extensions", {
    code: "UNAUTHENTICATED",
    fieldErrors: [],
  });
});

test("serves a scanned person's photo to the owner", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const avatarUrl = await scannedAvatarUrl(browser);

  const response = await browser.get(avatarUrl);

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(Buffer.from(await response.arrayBuffer())).toEqual(
    ACME.people.find(({ email }) => email === "ana@acme.example")!.photo,
  );
}, 90_000);

test("refuses a scanned person's photo without a session", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const avatarUrl = await scannedAvatarUrl(browser);

  const response = await env.browser().get(avatarUrl);

  expect(response.status).toBe(401);
}, 90_000);

async function scannedAvatarUrl(browser: Browser): Promise<string> {
  await expect
    .poll(
      async () => {
        const response = await browser.graphql("{ setup { googleWorkspace { scan { status } } } }");
        return response.json();
      },
      { timeout: 60_000, interval: 250 },
    )
    .toEqual({
      data: { setup: { googleWorkspace: { scan: { status: "SCANNED" } } } },
    });
  const people = await browser.graphql(`{
    employees(filter: { search: "ana@acme.example" }) { edges { node { avatarUrl } } }
  }`);
  const { data } = (await people.json()) as {
    data: { employees: { edges: { node: { avatarUrl: string | null } }[] } };
  };
  const { avatarUrl } = data.employees.edges[0]!.node;
  expect(avatarUrl).toEqual(expect.stringMatching(/^\/api\/employees\/avatar\//));
  return avatarUrl!;
}
