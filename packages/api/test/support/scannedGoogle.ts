import { expect } from "vitest";

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

export async function scannedApps(browser: Browser) {
  let discovered: { id: string; name: string; preselected: boolean }[] = [];
  await expect
    .poll(
      async () => {
        const response = await browser.graphql(`{
      apps(status: DISCOVERED) {
        edges { node { id name domain status peopleCount foundVia since { at before } preselected } }
        pageInfo { endCursor hasNextPage }
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
