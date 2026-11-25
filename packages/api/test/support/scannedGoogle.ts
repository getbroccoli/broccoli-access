import { expect } from "vitest";

import { ACME_DEMO_APPS } from "./approvedGoogleSetup";
import type { Browser } from "./browser";

export async function readGoogleConnection(browser: Browser) {
  const response = await browser.graphql(`{
    setup { googleWorkspace { id scan { id status readAt people { count suspended } } } }
  }`);
  const body = (await response.json()) as {
    data: {
      setup: {
        googleWorkspace: {
          id: string;
          scan: {
            id: string;
            status: string;
            readAt: string | null;
            people: { count: number | null; suspended: number | null };
          };
        };
      };
    };
  };
  return body.data.setup.googleWorkspace;
}

/** Finishes setup after the scan, approving the fixture's demo apps. */
export async function finishSetupWithDemoApps(browser: Browser) {
  const discovered = await scannedApps(browser);
  const approvedAppIds = discovered
    .filter(({ name }) => ACME_DEMO_APPS.includes(name))
    .map(({ id }) => id);
  const response = await browser.graphql(
    `mutation ($input: SetupFinishInput!) {
      apps { finishSetup(input: $input) { setup { step } error { __typename } } }
    }`,
    { input: { approvedAppIds } },
  );
  expect(await response.json()).toEqual({
    data: { apps: { finishSetup: { setup: { step: "DONE" }, error: null } } },
  });
}

export async function scannedApps(browser: Browser) {
  let discovered: { id: string; name: string }[] = [];
  await expect
    .poll(
      async () => {
        const response = await browser.graphql(`{
      apps(status: DISCOVERED) {
        edges { node { id name } }
      }
      setup { step }
    }`);
        const body = (await response.json()) as {
          data?: {
            apps: { edges: { node: (typeof discovered)[number] }[] };
            setup: { step: string };
          };
        };
        discovered = body.data?.apps.edges.map(({ node }) => node) ?? [];
        return { count: discovered.length, step: body.data?.setup.step };
      },
      { timeout: 60_000, interval: 250 },
    )
    .toEqual({ count: 37, step: "SELECT_APPS" });
  return discovered;
}

export const SCAN_NOW = `mutation ($connectionId: ID!) {
  imports { scanConnection(connectionId: $connectionId) {
    scan { id status readAt people { count suspended } }
  } }
}`;
