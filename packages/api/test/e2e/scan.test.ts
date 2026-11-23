import { sql } from "drizzle-orm";
import { onTestFinished } from "vitest";

import { expect, test, startTestServer, waitForStartup } from "#test/support";

test("the owner's consent runs the scan and exposes its people and app counts through GraphQL", async ({
  env,
}) => {
  const { browser } = await env.signInAsOwner();

  await expect
    .poll(
      async () => {
        const response = await browser.graphql(
          "{ setup { googleWorkspace { scan { status people { state count suspended } apps { state count } signInLogs { state } } } } }",
        );
        return response.json();
      },
      { timeout: 60_000, interval: 250 },
    )
    .toEqual({
      data: {
        setup: {
          googleWorkspace: {
            scan: {
              status: "SCANNED",
              people: { state: "DONE", count: 42, suspended: 2 },
              apps: { state: "DONE", count: 37 },
              signInLogs: { state: "DONE" },
            },
          },
        },
      },
    });
}, 90_000);

test("the started server has a daily scan schedule", async ({ orm, databaseUrl }) => {
  const server = await startTestServer(databaseUrl);
  onTestFinished(() => server.stop());
  expect(await waitForStartup(server)).toMatchObject({ status: "ready" });

  const schedules = await orm.execute(sql`select name from pgboss.schedule`);

  expect(schedules.rows).toContainEqual({ name: "imports.scanEveryConnection" });
});
