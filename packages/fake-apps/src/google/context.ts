import type { CryptoKey, JWK } from "jose";

import type { GoogleState } from "./state";

/** What every part of the fake Google shares while it runs. */
export interface FakeGoogleContext {
  /** Replaced by a fresh seeded state on reset. */
  state: GoogleState;
  now: () => Date;
  /** Address browsers reach, for the consent page. */
  browserUrl: string;
  /** Address servers reach, for tokens and the Admin APIs. */
  serverUrl: string;
  signingKey: SigningKey;
  /** The largest page a list returns, whatever the caller asks; unset for Google's own bounds. */
  maxPageSize?: number;
  reset: () => void;
}

/** The RSA key that signs ID tokens, created at start and published at `jwks_uri`. */
export interface SigningKey {
  kid: string;
  privateKey: CryptoKey;
  publicJwk: JWK;
}
