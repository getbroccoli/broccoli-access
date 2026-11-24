import { ACME } from "@broccoli-access/fake-apps";

import type { Orm } from "../../src/core/db";
import type { JobQueue } from "../../src/core/jobs";
import { googleConnection } from "./services";
import { registerGoogleRedirect } from "./googleConsent";
import { TestSeed } from "./testSeed";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/admin.directory.user.readonly",
  "https://www.googleapis.com/auth/admin.directory.user.security",
  "https://www.googleapis.com/auth/admin.directory.customer.readonly",
  "https://www.googleapis.com/auth/admin.reports.audit.readonly",
];

/** A live setup holder and a registered callback, before any consent. */
export async function googleSetup(
  orm: Orm,
  googleUrl: string,
  options: { jobs?: JobQueue; relayUrl?: string } = {},
) {
  const now = new Date("2026-11-21T12:00:00Z");
  const input = {
    clientId: ACME.oauthClient.clientId,
    clientSecret: ACME.oauthClient.clientSecret,
    publicOrigin: "http://localhost:3000",
    setupToken: "setup-token",
    now,
  };
  await new TestSeed(orm).setupSession({
    token: input.setupToken,
    expiresAt: new Date("2026-11-24T12:00:00Z"),
  });
  await registerGoogleRedirect(googleUrl, input.publicOrigin);
  return { connection: googleConnection(orm, { googleUrl, ...options }), input };
}
