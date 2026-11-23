import { expect } from "vitest";

import type { TestEnv } from "./testEnv";

export const START_PAIRING = "mutation { extension { startPairing { code } } }";
export const BROWSER = "Chrome on macOS";

export async function pairChrome(env: TestEnv) {
  const { browser } = await env.signInAsOwner();
  const start = await browser.graphql(START_PAIRING);
  const result = (await start.json()) as {
    data: { extension: { startPairing: { code: string } } };
  };
  expect(result).toEqual({
    data: { extension: { startPairing: { code: expect.stringMatching(/\S/) as unknown } } },
  });

  const response = await redeemCode(env, result.data.extension.startPairing.code);

  expect(response.status).toBe(201);
  const credentials = (await response.json()) as { token: string };
  expect(credentials).toEqual({ token: expect.stringMatching(/\S/) as unknown });
  return { browser, token: credentials.token };
}

export function redeemCode(env: TestEnv, code: string) {
  return fetch(new URL("/api/extension/pairings", env.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, browser: BROWSER }),
  });
}
