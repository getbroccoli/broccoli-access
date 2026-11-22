/** The paired instance and the token it gave, which only the service worker holds. */
export interface StoredPairing {
  origin: string;
  token: string;
}

/**
 * The instance's answer to a call to `path` with the pairing's token; null when it did not answer
 * in time, such as offline.
 */
export async function callInstance(
  pairing: StoredPairing,
  path: string,
  init: { method: "GET" | "POST" | "DELETE"; body?: unknown; timeoutMs?: number },
): Promise<Response | null> {
  try {
    return await fetch(`${pairing.origin}${path}`, {
      method: init.method,
      headers: {
        authorization: `Bearer ${pairing.token}`,
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(init.timeoutMs ?? INSTANCE_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

/** How long a call to the instance may take before the extension stops waiting for it. */
const INSTANCE_TIMEOUT_MS = 10_000;
