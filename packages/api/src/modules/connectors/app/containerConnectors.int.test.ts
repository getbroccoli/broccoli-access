import { startFakeConnectors } from "@broccoli-access/fake-apps";

import { containerConnectors, expect, serveManifest, test } from "#test/support";

test("lists the container's connectors with their manifest fields", async ({ fakeConnectors }) => {
  const listed = await containerConnectors(fakeConnectors.url).list();

  expect(listed.map(({ key }) => key).sort()).toEqual(["linear", "slack"]);
  expect(listed.find(({ key }) => key === "linear")).toMatchObject({
    key: "linear",
    version: 1,
    name: "Linear",
    appDomain: "linear.app",
    notice: null,
    adminUrl: "https://linear.app/{urlKey}/settings/members",
    runtimes: ["server"],
    capabilities: ["list_accounts", "suspend", "reactivate"],
    findingKinds: { ownAppAccounts: "linear_members" },
    isDirectory: false,
    connectionFields: [
      {
        key: "apiKey",
        kind: "text",
        label: "Personal API key",
        help: "In Linear, signed in as an admin, open Settings → Account → Security & access, create a personal API key with full access and paste it here.",
        secret: true,
      },
    ],
  });
  expect(listed.find(({ key }) => key === "slack")?.connectionFields).toMatchObject([
    { key: "appSession", kind: "app_session", secret: true },
  ]);
});

test("lists no container connectors without a URL", async () => {
  expect(await containerConnectors().list()).toEqual([]);
});

test("retries an unavailable manifest and keeps the successful list", async () => {
  const original = await startFakeConnectors({ delayMs: 0 });
  await original.stop();
  const connectors = containerConnectors(original.url);
  expect(await connectors.list()).toEqual([]);

  const recovered = await startFakeConnectors({
    port: Number(new URL(original.url).port),
    delayMs: 0,
  });
  try {
    expect((await connectors.list()).map(({ key }) => key).sort()).toEqual(["linear", "slack"]);
  } finally {
    await recovered.stop();
  }

  expect((await connectors.list()).map(({ key }) => key).sort()).toEqual(["linear", "slack"]);
});

test("omits only the connector that asks for the same field as both secret and public", async ({
  fakeConnectors,
}) => {
  const server = await serveManifest(fakeConnectors.url, ({ connectors }) => {
    const linear = connectors.find((connector) => connector.key === "linear")!;
    linear.connectionFields.push({
      key: "apiKey",
      kind: "text",
      label: "Public key",
      help: "",
      secret: false,
    });
  });

  const listed = await containerConnectors(server.url).list();

  expect(listed.map((connector) => connector.key)).toEqual(["slack"]);
});
