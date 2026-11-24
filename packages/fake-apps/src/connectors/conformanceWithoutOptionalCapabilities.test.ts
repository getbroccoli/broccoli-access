import { CONNECTOR_MANIFEST } from "@broccoli-access/connector-contract";
import { describeConnectorConformance } from "@broccoli-access/connector-contract/conformance";
import express from "express";
import { afterAll } from "vitest";

import { control, memberAccount } from "#test/support";
import { ACME_LINEAR } from "../seed";
import { listen } from "../utils";
import { startFakeConnectors } from "./fakeConnectors";

describeConnectorConformance({
  urls: [await linearWithoutOptionalCapabilities(), await linearWithoutOptionalCapabilities()],
  fixtures: [
    {
      connector: "linear",
      connection: () => Promise.resolve({ settings: {}, secrets: { apiKey: ACME_LINEAR.apiKey } }),
      member: memberAccount(ACME_LINEAR, "chloe@acme.example"),
      causeError: (url, code) =>
        control(url, "/failures", {
          connector: "linear",
          call: "actions/run",
          code: actionErrors[code],
          count: 1,
        }),
      reset: async (url) => {
        await control(url, "/reset");
        await control(url, "/delay", { milliseconds: 0 });
      },
    },
  ],
});

// A fixture written before sign-in knows only the errors an action can give.
const actionErrors = {
  authentication_failed: "authentication_failed",
  permission_missing: "permission_missing",
  rate_limited: "rate_limited",
  app_unavailable: "app_unavailable",
  unexpected_response: "unexpected_response",
  blocked_by_check: "blocked_by_check",
  account_not_found: "account_not_found",
  wrong_workspace: "wrong_workspace",
  not_allowed: "not_allowed",
  owner_browser_lost: "owner_browser_lost",
} as const;

async function linearWithoutOptionalCapabilities(): Promise<string> {
  const fake = await startFakeConnectors({ delayMs: 0 });
  afterAll(fake.stop);
  const app = express();
  app.get("/v1/connectors", async (_request, response) => {
    const upstream = await fetch(`${fake.url}/v1/connectors`);
    const manifest = CONNECTOR_MANIFEST.parse(await upstream.json());
    const linear = manifest.connectors.find(({ key }) => key === "linear")!;
    const capabilities = linear.capabilities.filter(
      (capability) => !["invite", "list_invitations", "remove"].includes(capability),
    );
    response.json({ connectors: [{ ...linear, capabilities, roles: undefined }] });
  });
  app.use(express.text({ type: "*/*" }), async (request, response) => {
    const upstream = await fetch(fake.url + request.originalUrl, {
      method: request.method,
      headers: request.headers as Record<string, string>,
      body: request.body as string | undefined,
    });
    response
      .status(upstream.status)
      .set(Object.fromEntries(upstream.headers))
      .send(Buffer.from(await upstream.arrayBuffer()));
  });
  const stub = await listen("127.0.0.1");
  afterAll(stub.stop);
  stub.server.on("request", app);
  return stub.url;
}
