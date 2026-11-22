import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import type { BetterAuthPlugin } from "better-auth";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

import type { Transact } from "../../db";
import { PrincipalSecurityContext } from "../../security";
import { createSetupSessionService } from "../app";
import { OwnerExistsError, SETUP_SESSION_DAYS, SetupInProgressError } from "../domain";
import { readSetupToken, setSetupCookie } from "./setupCookie";

const setupSessions = createSetupSessionService();

const SYSTEM = PrincipalSecurityContext.system();

const OWNER_EXISTS = { code: "OWNER_EXISTS", message: "The owner account already exists" };
const SETUP_IN_PROGRESS = {
  code: "SETUP_IN_PROGRESS",
  message: "Setup is in progress on another device",
};

/**
 * Setup before the owner exists, and the sessions that sign people in. `POST /api/auth/setup/start`
 * gives setup to the first browser, or renews it for the browser holding it, through the
 * `broccoli_access_setup` cookie; `setupRouter` limits and origin-checks it before it runs.
 * `startSession`, server-only, signs in a user whom a module has just verified, such as the owner
 * after Google's consent, and ends the setup cookie.
 */
export function setupPlugin(transact: Transact) {
  return {
    id: "setup",
    endpoints: {
      startSetup: createAuthEndpoint("/setup/start", { method: "POST" }, async (ctx) => {
        const token = readSetupToken(ctx.headers?.get("cookie") ?? undefined);
        const session = await refusingSetupConflicts(() =>
          transact((tx) => setupSessions.startSetup(SYSTEM, tx, { token, now: new Date() })),
        );
        setSetupCookie(ctx, session.token, SETUP_SESSION_DAYS * DAY_SECONDS);
        return ctx.json({ holder: "you" });
      }),
      startSession: createAuthEndpoint.serverOnly(
        { method: "POST", body: z.object({ userId: z.string() }) },
        async (ctx) => {
          const { internalAdapter } = ctx.context;
          const user = await internalAdapter.findUserById(ctx.body.userId);
          if (!user) {
            throw APIError.from("NOT_FOUND", { code: "USER_NOT_FOUND", message: "No such user" });
          }
          await setSessionCookie(ctx, {
            user,
            session: await internalAdapter.createSession(user.id),
          });
          setSetupCookie(ctx, "", 0);
          return ctx.json(null);
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

const DAY_SECONDS = 24 * 60 * 60;

/** Answers the refusals of setup as HTTP conflicts. */
async function refusingSetupConflicts<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof OwnerExistsError) {
      throw APIError.from("CONFLICT", OWNER_EXISTS);
    }
    if (error instanceof SetupInProgressError) {
      throw APIError.from("CONFLICT", SETUP_IN_PROGRESS);
    }
    throw error;
  }
}
