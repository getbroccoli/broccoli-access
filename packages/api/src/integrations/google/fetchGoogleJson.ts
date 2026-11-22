import type { z } from "zod";

import { fetchJson } from "../../utils";

/** A Google answer parsed with `schema`; null for a 404. */
export function fetchGoogleJson<T>(
  url: URL,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T | null> {
  return fetchJson(url, schema, { timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES, init });
}

/** An answer every call needs; a 404 is as wrong as any other failure here. */
export async function fetchRequired<T>(
  url: URL,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const answer = await fetchGoogleJson(url, schema, init);
  if (answer === null) {
    throw new Error(`${url.origin} answered 404`);
  }
  return answer;
}

export function bearer(accessToken: string): RequestInit {
  return { headers: { authorization: `Bearer ${accessToken}` } };
}

/** Google answers within seconds; a slower answer fails the consent instead of holding it. */
const TIMEOUT_MS = 10_000;
/** Far above any answer these endpoints give, such as a page of 500 users. */
const MAX_BYTES = 5_000_000;
