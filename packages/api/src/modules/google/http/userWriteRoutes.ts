import { parseCookies } from "better-auth/cookies";
import type { Request, Response } from "express";
import { z } from "zod";

import { NotSuperAdminError, OtherWorkspaceError, UserWriteRefusedError } from "../domain";
import {
  type Callback,
  cancelledOrFailed,
  consentCookie,
  type GoogleRoutes,
  logRefusal,
  requireSecurity,
  sendStartFailure,
} from "./consentHandling";
import { hasConsentAnswer } from "./googleConsentInput";

/** Starts the owner's consent to change the directory's users, binding its `state` to this browser. */
export async function startUserWriteConsent(
  { userWrites, http, logger }: GoogleRoutes,
  request: Request,
  response: Response,
): Promise<void> {
  try {
    // A body of another shape has no path, which the service refuses as invalid.
    const returnTo = CONSENT_START.safeParse(request.body).data?.returnTo ?? "";
    const security = await requireSecurity(http.resolveSecurity, request, NOT_OWNER);
    const origin = await http.publicOrigin(request);
    const { authorizationUrl, browserToken, callbackOrigin } = await userWrites.start(security, {
      returnTo,
      publicOrigin: origin,
      now: new Date(),
    });
    response.cookie(USER_WRITES_COOKIE, browserToken, consentCookie(callbackOrigin));
    response.json({ authorizationUrl });
  } catch (error) {
    sendStartFailure(error, response, logger);
  }
}

/** Google's answer: back to the page the owner came from, with the outcome in its query. */
export async function finishUserWriteConsent(
  { userWrites, http, logger }: GoogleRoutes,
  { request, response, answer }: Callback,
): Promise<void> {
  const now = new Date();
  const browserToken = parseCookies(request.headers.cookie ?? "").get(USER_WRITES_COOKIE) ?? null;
  const returnTo = userWrites.readReturnTo({ state: answer.state ?? "", browserToken, now });
  if (!hasConsentAnswer(answer)) {
    const failure = cancelledOrFailed(answer);
    logger.info({ failure }, "Google user write consent ended without an answer");
    sendBack(response, returnTo, failure);
    return;
  }
  try {
    const security = await requireSecurity(http.resolveSecurity, request, NOT_OWNER);
    const allowed = await userWrites.finish(security, {
      code: answer.code,
      handle: answer.handle,
      state: answer.state,
      publicOrigin: await http.publicOrigin(request),
      browserToken,
      now,
    });
    sendBack(response, allowed.returnTo, "allowed");
  } catch (error) {
    const failure = failureOf(error);
    logRefusal(logger, error, failure, "Google user write consent refused");
    sendBack(response, returnTo, failure);
  }
}

const NOT_OWNER = "Only the owner can allow changing Google users.";

/** Binds the consent's `state` to the browser that started it; only the callback receives it. */
const USER_WRITES_COOKIE = "broccoli_access_google_user_writes";

const CONSENT_START = z.object({ returnTo: z.string() });

/** Where an answer goes whose state cannot say where its owner came from. */
const FALLBACK_PAGE = "/people";

/** How the consent ended, as the page the owner returns to reads it from `googleUserWrites`. */
type Outcome =
  "allowed" | "cancelled" | "permission_refused" | "not_super_admin" | "other_workspace" | "failed";

function failureOf(error: unknown): Outcome {
  if (error instanceof UserWriteRefusedError) {
    return "permission_refused";
  }
  if (error instanceof OtherWorkspaceError) {
    return "other_workspace";
  }
  return error instanceof NotSuperAdminError ? "not_super_admin" : "failed";
}

/** Redirects to the owner's page, which `start` checked is a path of this instance. */
function sendBack(response: Response, returnTo: string | null, outcome: Outcome): void {
  const page = returnTo ?? FALLBACK_PAGE;
  const separator = page.includes("?") ? "&" : "?";
  response.redirect(302, `${page}${separator}googleUserWrites=${outcome}`);
}
