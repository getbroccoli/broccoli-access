import {
  describeConnectorConformance,
  startContainers,
  type ConnectorFixture,
} from "@broccoli-access/connector-contract/conformance";
import { afterAll } from "vitest";

import {
  control,
  integrationUser,
  inviteSlackAdmin,
  memberAccount,
  signInToFakeSlack,
} from "#test/support";
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
      invitee: { email: "ivan@acme.example" },
      member: memberAccount(ACME_SLACK, "ana@acme.example"),
      memberToRemove: memberAccount(ACME_SLACK, "ben@acme.example"),
      signIn: {
        integrationUser,
        causeError: (url, code) =>
          control(url, "/failures", {
            connector: "slack",
            call: "connections/sign-in",
            code,
            count: 1,
          }),
      },
      causeError: failNextAction("slack"),
      reset: async (url) => {
        await reset(url);
        await inviteSlackAdmin(url);
      },
    },
    {
      connector: "linear",
      connection: () => Promise.resolve({ settings: {}, secrets: { apiKey: ACME_LINEAR.apiKey } }),
      invitee: { email: "ivan@acme.example" },
      member: memberAccount(ACME_LINEAR, "chloe@acme.example"),
      memberToRemove: memberAccount(ACME_LINEAR, "david@acme.example"),
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
