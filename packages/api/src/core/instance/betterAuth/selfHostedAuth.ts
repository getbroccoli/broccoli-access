import type { BetterAuthPlugin } from "better-auth";

import { type Auth, createBetterAuth } from "../../auth";
import type { Orm, Transact } from "../../db";
import type { Logger } from "../../logger";
import { setupPlugin } from "./setupPlugin";

export interface SelfHostedAuthOptions {
  orm: Orm;
  transact: Transact;
  /** Signs session cookies. */
  secret: string;
  /** Unset takes the address from each request. */
  publicUrl?: string;
  logger: Logger;
  /** The modules' sign-in endpoints. */
  plugins: BetterAuthPlugin[];
}

/** Better Auth of the instance: setup for the first visitor, and the sessions modules start. */
export function selfHostedAuth({ transact, plugins, ...options }: SelfHostedAuthOptions): Auth {
  return createBetterAuth({ ...options, plugins: [setupPlugin(transact), ...plugins] });
}

/** Signs in `userId` and returns the response's `Set-Cookie` headers, through `setupPlugin`'s endpoint. */
export async function startSession(auth: Auth, userId: string): Promise<string[]> {
  // Better Auth types `api` from the plugins it is given, which `createBetterAuth` takes as a list.
  const api = auth.api as unknown as SessionApi;
  const { headers } = await api.startSession({ body: { userId }, returnHeaders: true });
  return headers.getSetCookie();
}

interface SessionApi {
  startSession(request: {
    body: { userId: string };
    returnHeaders: true;
  }): Promise<{ headers: Headers }>;
}
