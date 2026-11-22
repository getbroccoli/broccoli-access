import { jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";

/** Who Google says signed in; the Directory gives their email. */
export interface GoogleIdentity {
  /** Google's user id. */
  sub: string;
}

/**
 * The identity in a Google ID token, once its RS256 signature, issuer, audience, nonce and
 * expiry hold at `now`; rejects otherwise. The issuer is the discovery document's, compared as
 * given, since Google serves that document from another address than its issuer.
 */
export async function verifyIdToken(
  idToken: string,
  {
    keys,
    issuer,
    clientId,
    nonce,
    now,
  }: { keys: JWTVerifyGetKey; issuer: string; clientId: string; nonce: string; now: Date },
): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(idToken, keys, {
    algorithms: ["RS256"],
    issuer,
    audience: clientId,
    currentDate: now,
    requiredClaims: ["exp"],
  });
  const claims = ID_TOKEN_CLAIMS.parse(payload);
  if (claims.nonce !== nonce) {
    throw new Error("The ID token answers another sign-in");
  }
  return { sub: claims.sub };
}

const ID_TOKEN_CLAIMS = z.object({ sub: z.string(), nonce: z.string() });
