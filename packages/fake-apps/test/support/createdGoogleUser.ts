import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { startFakeConnectors } from "../../src/connectors";
import { test } from "./fakeGoogle";
import { integrationUser } from "./integrationUser";

export const testWithCreatedGoogleUser = test.extend<{
  connectors: { url: string };
}>({
  // eslint-disable-next-line no-empty-pattern -- Vitest requires destructured fixture dependencies.
  connectors: async ({}, use) => {
    await using google = createServer((request, response) => {
      if (request.method !== "GET" || request.url !== "/_fake/state") {
        response.writeHead(404).end();
        return;
      }
      const createdUsers = [
        { primaryEmail: integrationUser.email, suspended: false, changePasswordAtNextLogin: false },
      ];
      response
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ createdUsers }));
    });
    google.listen(0, "127.0.0.1");
    await once(google, "listening");
    const googleUrl = `http://127.0.0.1:${(google.address() as AddressInfo).port}`;
    const server = await startFakeConnectors({ delayMs: 0, googleUrl });
    try {
      await use({ url: server.url });
    } finally {
      await server.stop();
    }
  },
});
