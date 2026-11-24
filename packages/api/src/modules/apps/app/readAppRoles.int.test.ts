import { accountChanges, expect, OWNER, startFakeHttpServer, test } from "#test/support";

test("returns no roles for an unconnected app while the connector manifest is unavailable", async ({
  orm,
  seed,
}) => {
  const app = await seed.app({ status: "approved" });
  const answer = Promise.withResolvers<{ status: number }>();
  const server = await startFakeHttpServer(() => answer.promise);
  const service = accountChanges(orm, { connectorsUrl: server.url });
  const read = service.readAppRoles(OWNER, [app.id]);
  let roles: unknown;
  const result = read.then((byApp) => {
    roles = byApp.get(app.id) ?? [];
  });
  try {
    await expect.poll(() => roles, { timeout: 2000 }).toEqual([]);
  } finally {
    answer.resolve({ status: 503 });
    await server.stop();
    await result;
  }
});
