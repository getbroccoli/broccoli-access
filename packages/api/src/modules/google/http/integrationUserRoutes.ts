import { parseCookies } from "better-auth/cookies";
import type { Request, Response } from "express";
import { z } from "zod";

import {
  EmailTakenError,
  NotSuperAdminError,
  OtherWorkspaceError,
  UserWriteRefusedError,
} from "../domain";
import {
  type Callback,
  cancelledOrFailed,
  consentCookie,
  GOOGLE_WORKSPACE_SETTINGS_PAGE,
  type GoogleRoutes,
  logRefusal,
  requireSecurity,
  sendStartFailure,
} from "./consentHandling";
import { hasConsentAnswer } from "./googleConsentInput";

/** Starts the owner's consent to create the integration user, binding its `state` to this browser. */
export async function startIntegrationUserCreation(
  { integrationUsers, http, logger }: GoogleRoutes,
  request: Request,
  response: Response,
): Promise<void> {
  try {
    // A body of another shape has no address, which the service refuses as required.
    const email = CREATION_START.safeParse(request.body).data?.email ?? "";
    const security = await requireSecurity(http.resolveSecurity, request, NOT_OWNER);
    const origin = await http.publicOrigin(request);
    const { authorizationUrl, browserToken } = await integrationUsers.startCreation(security, {
      email,
      publicOrigin: origin,
      now: new Date(),
    });
    response.cookie(INTEGRATION_USER_COOKIE, browserToken, consentCookie(origin));
    response.json({ authorizationUrl });
  } catch (error) {
    sendStartFailure(error, response, logger);
  }
}

/** Google's answer: back to Google Workspace, with the integration user created or why it was not. */
export async function finishIntegrationUserCreation(
  { integrationUsers, http, logger }: GoogleRoutes,
  { request, response, answer }: Callback,
): Promise<void> {
  const origin = await http.publicOrigin(request);
  if (!hasConsentAnswer(answer)) {
    const failure = cancelledOrFailed(answer);
    logger.info({ failure }, "Integration user consent ended without an answer");
    sendBackToGoogleWorkspace(response, failure);
    return;
  }
  try {
    const security = await requireSecurity(http.resolveSecurity, request, NOT_OWNER);
    await integrationUsers.finishCreation(security, {
      code: answer.code,
      handle: answer.handle,
      state: answer.state,
      publicOrigin: origin,
      browserToken: parseCookies(request.headers.cookie ?? "").get(INTEGRATION_USER_COOKIE) ?? null,
      now: new Date(),
    });
    response.redirect(302, GOOGLE_WORKSPACE_SETTINGS_PAGE);
  } catch (error) {
    const failure = creationFailureOf(error);
    logRefusal(logger, error, failure, "Integration user creation refused");
    sendBackToGoogleWorkspace(response, failure);
  }
}

const NOT_OWNER = "Only the owner can create the integration user.";

/** Binds a creation's `state` to the browser that started it; only the callback receives it. */
const INTEGRATION_USER_COOKIE = "broccoli_access_google_integration_user";

const CREATION_START = z.object({ email: z.string().catch("") });

/** Why creating the integration user failed, as the Google Workspace page shows it. */
type CreationFailure =
  | "cancelled"
  | "permission_refused"
  | "email_taken"
  | "not_super_admin"
  | "other_workspace"
  | "failed";

function creationFailureOf(error: unknown): CreationFailure {
  if (error instanceof UserWriteRefusedError) {
    return "permission_refused";
  }
  if (error instanceof EmailTakenError) {
    return "email_taken";
  }
  if (error instanceof OtherWorkspaceError) {
    return "other_workspace";
  }
  return error instanceof NotSuperAdminError ? "not_super_admin" : "failed";
}

function sendBackToGoogleWorkspace(response: Response, failure: CreationFailure): void {
  response.redirect(302, `${GOOGLE_WORKSPACE_SETTINGS_PAGE}?integrationUserError=${failure}`);
}
