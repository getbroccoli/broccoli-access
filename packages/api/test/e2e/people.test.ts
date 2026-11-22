import {
  expect,
  test,
  readGoogleConnection,
  finishSetupWithPreselectedApps,
  suspendAtFakeGoogle,
} from "#test/support";

test("lists and counts people suspended with access after Scan now", async ({
  env,
  fakeGoogle,
}) => {
  const { browser } = await env.signInAsOwner();
  await finishSetupWithPreselectedApps(browser);
  const connection = await readGoogleConnection(browser);
  await suspendAtFakeGoogle(fakeGoogle.url, "elif@acme.example");

  const scan = await browser.graphql(
    `mutation ($connectionId: ID!) {
    imports { scanConnection(connectionId: $connectionId) { scan { status } } }
  }`,
    { connectionId: connection.id },
  );

  expect(await scan.json()).toEqual({
    data: { imports: { scanConnection: { scan: { status: "SCANNING" } } } },
  });
  await expect
    .poll(() => readGoogleConnection(browser), { timeout: 60_000, interval: 250 })
    .toMatchObject({ scan: { status: "SCANNED", people: { count: 42, suspended: 3 } } });
  const response = await browser.graphql(`{
    employees(first: 100, orderBy: { field: STATUS }, filter: { suspendedWithAccess: true }) {
      edges { node { email status approvedAppNames } }
    }
    employeeCounts { all suspendedWithAccess }
  }`);
  expect(await response.json()).toEqual({
    data: {
      employees: {
        edges: [
          {
            node: {
              email: "ana@acme.example",
              status: "SUSPENDED",
              approvedAppNames: ["Figma", "Notion", "Slack"],
            },
          },
          { node: { email: "ben@acme.example", status: "SUSPENDED", approvedAppNames: ["Slack"] } },
          {
            node: {
              email: "elif@acme.example",
              status: "SUSPENDED",
              approvedAppNames: ["Figma", "Notion", "Slack"],
            },
          },
        ],
      },
      employeeCounts: { all: 42, suspendedWithAccess: 3 },
    },
  });
}, 90_000);

test("refuses employee counts without a session", async ({ env }) => {
  await env.signInAsOwner();

  const response = await env.browser().graphql("{ employeeCounts { all suspendedWithAccess } }");

  expect(await response.json()).toHaveProperty("errors.0.extensions", {
    code: "UNAUTHENTICATED",
    fieldErrors: [],
  });
});
