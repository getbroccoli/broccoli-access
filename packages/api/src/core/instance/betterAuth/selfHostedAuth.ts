import type { BetterAuthPlugin } from "better-auth";

import { type Auth, createBetterAuth } from "../../auth";
import type { Orm, Transact } from "../../db";
import type { Logger } from "../../logger";
import { PrincipalSecurityContext } from "../../security";
import type { PasswordResetEmailService } from "../app";
import { setupPlugin } from "./setupPlugin";

export interface SelfHostedAuthOptions {
  orm: Orm;
  transact: Transact;
  /** Signs session cookies. */
  secret: string;
  /** Unset takes the address from each request. */
  publicUrl?: string;
  logger: Logger;
  passwordResetEmail: Pick<PasswordResetEmailService, "queue">;
  /** The modules' sign-in endpoints. */
  plugins: BetterAuthPlugin[];
}

/** Better Auth of the instance: password sign-in, and setup for the first visitor. */
export function selfHostedAuth({
  transact,
  passwordResetEmail,
  plugins,
  ...options
}: SelfHostedAuthOptions): Auth {
  return createBetterAuth({
    ...options,
    // Better Auth asks for a reset without a signed-in user.
    sendResetPassword: (user, token) =>
      passwordResetEmail.queue(PrincipalSecurityContext.system(), user, token),
    plugins: [setupPlugin(options.orm, transact), ...plugins],
  });
}
