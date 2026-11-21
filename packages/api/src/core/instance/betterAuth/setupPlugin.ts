import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import type { BetterAuthPlugin } from "better-auth";
import { setSessionCookie } from "better-auth/cookies";

import { ApplicationError } from "../../applicationError";
import type { Orm, Transact } from "../../db";
import { PrincipalSecurityContext } from "../../security";
import { createSetupSessionService, createOwnerService, createInstanceService } from "../app";
import { OwnerExistsError, SETUP_SESSION_DAYS, SetupInProgressError } from "../domain";
import { inAuthTransaction } from "./authTransaction";
import { assertValidCredentials, credentialsBody, linkPassword } from "./credentials";
import { readSetupToken, setSetupCookie } from "./setupCookie";

const setupSessions = createSetupSessionService();
const owners = createOwnerService();
const instances = createInstanceService();

const SYSTEM = PrincipalSecurityContext.system();

const OWNER_EXISTS = { code: "OWNER_EXISTS", message: "The owner account already exists" };
const SETUP_IN_PROGRESS = {
  code: "SETUP_IN_PROGRESS",
  message: "Setup is in progress on another device",
};
const NOT_AT_OWNER_STEP = { code: "NOT_AT_OWNER_STEP", message: "Setup is already done" };

/**
 * Setup before the owner exists. `POST /api/auth/setup/start` gives setup to the first browser,
 * or renews it for the browser holding it, through the `broccoli_access_setup` cookie.
 * `POST /api/auth/setup`, its only step, creates the owner for that browser with a password and
 * signs them in. `setupRouter` limits and origin-checks both before they run.
 */
export function setupPlugin(orm: Orm, transact: Transact) {
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
      setup: createAuthEndpoint(
        "/setup",
        { method: "POST", body: credentialsBody },
        async (ctx) => {
          assertValidCredentials(ctx.body, ctx.context.password.config);
          const token = readSetupToken(ctx.headers?.get("cookie") ?? undefined);
          // Checked early to skip the slow hashing; the transaction checks again.
          await assertHoldsSetup(orm, token);
          // Hashing is slow, so it happens before the transaction takes its lock.
          const passwordHash = await ctx.context.password.hash(ctx.body.password);
          const owner = await refusingSetupConflicts(
            () =>
              createOwner(transact, ctx, {
                token,
                email: ctx.body.email.toLowerCase(),
                passwordHash,
              }),
            NOT_AT_OWNER_STEP,
          );
          await setSessionCookie(ctx, owner);
          setSetupCookie(ctx, "", 0);
          return ctx.json({ user: { id: owner.user.id, email: owner.user.email } });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

const DAY_SECONDS = 24 * 60 * 60;

async function assertHoldsSetup(orm: Orm, token: string | null): Promise<void> {
  if ((await instances.readInstance(orm)).ownerUserId) {
    throw APIError.from("CONFLICT", OWNER_EXISTS);
  }
  if ((await setupSessions.readSetupHolder(orm, { token, now: new Date() })) !== "you") {
    throw APIError.from("CONFLICT", SETUP_IN_PROGRESS);
  }
}

/** Creates the owner with a password and a session, in one transaction. */
function createOwner(
  transact: Transact,
  ctx: GenericEndpointContext,
  { token, email, passwordHash }: { token: string | null; email: string; passwordHash: string },
) {
  const { internalAdapter } = ctx.context;
  return inAuthTransaction(transact, ctx, (tx) =>
    owners.createOwnerAtSetup(SYSTEM, tx, { token, now: new Date() }, async () => {
      const user = await internalAdapter.createUser(
        { email, name: "", emailVerified: false },
        { method: "email-password" },
      );
      await linkPassword(ctx, user.id, passwordHash);
      return { user, session: await internalAdapter.createSession(user.id) };
    }),
  );
}

/** Answers the refusals of setup as HTTP conflicts; `stepConflict` names a wrong step. */
async function refusingSetupConflicts<T>(
  run: () => Promise<T>,
  stepConflict?: { code: string; message: string },
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof OwnerExistsError) {
      throw APIError.from("CONFLICT", OWNER_EXISTS);
    }
    if (error instanceof SetupInProgressError) {
      throw APIError.from("CONFLICT", SETUP_IN_PROGRESS);
    }
    if (stepConflict && error instanceof ApplicationError && error.code === "CONFLICT") {
      throw APIError.from("CONFLICT", stepConflict);
    }
    throw error;
  }
}
