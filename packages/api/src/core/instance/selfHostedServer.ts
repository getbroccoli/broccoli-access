import type { BetterAuthPlugin } from "better-auth";

import type { DeploymentServer } from "../auth";
import type { Orm, Transact } from "../db";
import type { Logger } from "../logger";
import { selfHostedAuth, startSession } from "./betterAuth";
import { setupRouter } from "./http";

export interface SelfHostedServerOptions {
  orm: Orm;
  transact: Transact;
  /** Signs session cookies. */
  secret: string;
  logger: Logger;
  /** `SELF_HOSTED_PUBLIC_URL`; unset takes the address from each request. */
  publicUrl?: string;
  /** The modules' sign-in endpoints. */
  plugins: BetterAuthPlugin[];
}

/**
 * Wires the instance's sign-in: sessions, and setup for the first visitor, whose endpoints its
 * router limits and origin-checks.
 */
export function selfHostedServer({
  publicUrl,
  ...options
}: SelfHostedServerOptions): DeploymentServer {
  const publicOrigin = publicUrl && new URL(publicUrl).origin;
  const auth = selfHostedAuth({ ...options, publicUrl });
  return {
    auth,
    router: setupRouter(publicUrl),
    publicOrigin: (request) =>
      Promise.resolve(publicOrigin || `${request.protocol}://${request.host}`),
    startSession: (userId) => startSession(auth, userId),
  };
}
