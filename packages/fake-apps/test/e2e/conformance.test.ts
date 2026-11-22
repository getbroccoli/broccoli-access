import {
  describeConnectorConformance,
  startContainers,
  type ConnectorFixture,
} from "@broccoli-access/connector-contract";
import { afterAll } from "vitest";

import { control, memberAccount, signInToFakeSlack } from "#test/support";
import { ACME_LINEAR, ACME_SLACK } from "../../src/seed";

const image = process.env.FAKE_CONNECTORS_IMAGE;
if (!image)
  throw new Error(
    "FAKE_CONNECTORS_IMAGE is required. Run pnpm --filter @broccoli-access/fake-apps test:e2e.",
  );

const { urls, stop } = await startContainers(image);
afterAll(stop);

describeConnectorConformance({
  urls,
  fixtures: [
    {
      connector: "slack",
      connection: async (url) => ({
        settings: {},
        secrets: { appSession: await signInToFakeSlack(url) },
      }),
      member: memberAccount(ACME_SLACK, "ana@acme.example"),
      causeError: failNextAction("slack"),
      reset,
    },
    {
      connector: "linear",
      connection: () => Promise.resolve({ settings: {}, secrets: { apiKey: ACME_LINEAR.apiKey } }),
      member: memberAccount(ACME_LINEAR, "chloe@acme.example"),
      causeError: failNextAction("linear"),
      reset,
    },
  ],
});

function failNextAction(connector: string): ConnectorFixture["causeError"] {
  return (url, code) =>
    control(url, "/failures", { connector, call: "actions/run", code, count: 1 });
}

async function reset(url: string) {
  await control(url, "/reset");
  await control(url, "/delay", { milliseconds: 0 });
}
