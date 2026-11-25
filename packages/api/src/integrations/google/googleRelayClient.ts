import { createHash } from "node:crypto";

import { z } from "zod";

import { fetchJson, readText } from "../../utils";
import type { GoogleTokens } from "./googleClient";
import { shortScopeName } from "./shortScopeName";

/** The shared Google app's authorization and server-to-server token endpoints. */
export interface GoogleRelayClient {
  authorize: (request: RelayAuthorization) => string;
  redeem: (
    handle: string,
    codeVerifier: string,
    returnTo: string,
  ) => Promise<GoogleTokens & { clientId: string }>;
  refresh: (refreshToken: string) => Promise<string>;
}

interface RelayAuthorization {
  returnTo: string;
  state: string;
  codeVerifier: string;
  nonce: string;
  purpose: "connect" | "sign_in" | "user_write";
}

export function createGoogleRelayClient(relayUrl: string): GoogleRelayClient {
  const base = new URL(relayUrl);
  base.pathname = base.pathname.replace(/\/$/, "") + "/";
  const endpoint = (path: string) => new URL(`google/${path}`, base);
  return {
    authorize({ returnTo, state, codeVerifier, nonce, purpose }) {
      const url = endpoint("authorize");
      url.search = new URLSearchParams({
        return_to: returnTo,
        state,
        code_challenge: createHash("sha256").update(codeVerifier).digest("base64url"),
        nonce,
        purpose,
      }).toString();
      return url.toString();
    },
    async redeem(handle, codeVerifier, returnTo) {
      const tokens = await fetchRelay(
        endpoint("redeem"),
        REDEEMED,
        jsonPost({ handle, code_verifier: codeVerifier, return_to: returnTo }),
      );
      return {
        clientId: tokens.client_id,
        accessToken: tokens.access_token,
        idToken: tokens.id_token,
        refreshToken: tokens.refresh_token,
        scopes: tokens.scope.split(" ").filter(Boolean).map(shortScopeName),
      };
    },
    async refresh(refreshToken) {
      const tokens = await fetchRelay(
        endpoint("refresh"),
        REFRESHED,
        jsonPost({ refresh_token: refreshToken }),
      );
      return tokens.access_token;
    },
  };
}

function jsonPost(body: Record<string, string>): RequestInit {
  return {
    method: "POST",
    redirect: "error",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

const REFRESHED = z.object({ ok: z.literal(true), access_token: z.string().min(1) });
const REDEEMED = REFRESHED.extend({
  client_id: z.string().min(1),
  id_token: z.string().min(1),
  refresh_token: z.string().min(1).nullable(),
  scope: z.string(),
});

/** Relay transport failures remain distinct from a revoked Google grant. */
export class GoogleRelayError extends Error {
  constructor(
    readonly code:
      "authentication_failed" | "invalid_handoff" | "app_unavailable" | "unexpected_response",
  ) {
    super(`Google relay failed: ${code}`);
    this.name = "GoogleRelayError";
  }
}

async function fetchRelay<T>(url: URL, schema: z.ZodType<T>, init: RequestInit): Promise<T> {
  const answer = await fetchJson(url, schema, {
    timeoutMs: 10_000,
    maxBytes: 64_000,
    init,
    errorOfResponse: relayError,
  });
  if (answer === null) throw new GoogleRelayError("app_unavailable");
  return answer;
}

async function relayError(response: Response): Promise<Error> {
  if (response.status !== 400) return new GoogleRelayError("app_unavailable");
  try {
    const body: unknown = JSON.parse(await readText(response, 64_000));
    const error = z.object({ ok: z.literal(false), error: z.string() }).safeParse(body);
    if (error.success && error.data.error === "invalid_handoff") {
      return new GoogleRelayError("invalid_handoff");
    }
    if (error.success && error.data.error === "invalid_grant") {
      return new GoogleRelayError("authentication_failed");
    }
  } catch {
    // A malformed error is a protocol failure, never evidence of a revoked grant.
  }
  return new GoogleRelayError("unexpected_response");
}
