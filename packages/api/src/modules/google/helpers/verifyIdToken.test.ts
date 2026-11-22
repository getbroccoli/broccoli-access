import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { expect, it } from "vitest";

import { verifyIdToken } from ".";

it("accepts a signed token for this client and nonce", async () => {
  const { token, options } = await signedToken();

  await expect(verifyIdToken(token, options)).resolves.toEqual({
    sub: "google-admin",
  });
});

it.each([
  ["another audience", { aud: "another-client" }],
  ["another nonce", { nonce: "another-nonce" }],
  ["another issuer", { iss: "https://another.example.com" }],
  ["an expired token", { exp: new Date("2026-11-20T23:59:59Z").getTime() / 1000 }],
])("rejects %s", async (_description, claims) => {
  const { token, options } = await signedToken(claims);

  await expect(verifyIdToken(token, options)).rejects.toThrow();
});

it("rejects a token signed with another key", async () => {
  const { token, options } = await signedToken();
  const other = await generateKeyPair("RS256");
  const keys = createLocalJWKSet({ keys: [await exportJWK(other.publicKey)] });

  await expect(verifyIdToken(token, { ...options, keys })).rejects.toThrow();
});

async function signedToken(claims: Record<string, unknown> = {}) {
  const pair = await generateKeyPair("RS256");
  const now = new Date("2026-11-21T00:00:00Z");
  const options = {
    keys: createLocalJWKSet({ keys: [await exportJWK(pair.publicKey)] }),
    issuer: "https://accounts.google.com",
    clientId: "client-id",
    nonce: "nonce",
    now,
  };
  const token = await new SignJWT({
    sub: "google-admin",
    email: "admin@acme.example",
    iss: options.issuer,
    aud: options.clientId,
    nonce: options.nonce,
    exp: now.getTime() / 1000 + 60,
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256" })
    .sign(pair.privateKey);
  return { token, options };
}
