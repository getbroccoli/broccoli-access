import { expect, test, suspendAtFakeGoogle, readGoogleConnection } from "#test/support";

test("Scan now picks up a suspension and advances the last scan time", async ({
  env,
  fakeGoogle,
}) => {
  const { browser } = await env.signInAsOwner();
  await expect
    .poll(() => readGoogleConnection(browser), { timeout: 60_000, interval: 250 })
    .toMatchObject({
      scan: { status: "SCANNED", people: { count: 42, suspended: 2 } },
    });
  const before = await readGoogleConnection(browser);
  expect(before.scan.readAt).toEqual(expect.any(String));
  await suspendAtFakeGoogle(fakeGoogle.url, "elif@acme.example");

  const response = await browser.graphql(SCAN_NOW, { connectionId: before.id });

  expect(await response.json()).toMatchObject({
    data: {
      imports: {
        scanConnection: {
          scan: {
            id: before.scan.id,
            status: "SCANNING",
            readAt: before.scan.readAt,
          },
        },
      },
    },
  });
  await expect
    .poll(() => readGoogleConnection(browser), { timeout: 60_000, interval: 250 })
    .toMatchObject({
      scan: { status: "SCANNED", people: { count: 42, suspended: 3 } },
    });
  const after = await readGoogleConnection(browser);
  expect(new Date(after.scan.readAt!).getTime()).toBeGreaterThan(
    new Date(before.scan.readAt!).getTime(),
  );
}, 90_000);

test("refuses Scan now without a session", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const { id } = await readGoogleConnection(browser);

  const response = await env.browser().graphql(SCAN_NOW, { connectionId: id });

  expect(await response.json()).toMatchObject({
    errors: [{ extensions: { code: "UNAUTHENTICATED" } }],
  });
});

const SCAN_NOW = `mutation ($connectionId: ID!) {
  imports { scanConnection(connectionId: $connectionId) {
    scan { id status readAt people { count suspended } }
  } }
}`;
