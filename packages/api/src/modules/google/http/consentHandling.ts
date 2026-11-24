import type { CookieOptions, Request, Response } from "express";

import { ApplicationError, sendApplicationError } from "../../../core/applicationError";
import type { Logger } from "../../../core/logger";
import type { ModuleHttp } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { UnsuccessfulAnswerError } from "../../../utils";
import type { GoogleConnectionService, GoogleSignInService, IntegrationUserService } from "../app";
import {
  EmailTakenError,
  GOOGLE_CALLBACK_PATH,
  NotSuperAdminError,
  OtherWorkspaceError,
  UnknownGoogleAccountError,
  UserWriteRefusedError,
} from "../domain";
import { CONSENT_LIFETIME_MS } from "../helpers";
import type { ConsentAnswer } from "./googleConsentInput";

/** What the callback's handlers use. */
export interface GoogleRoutes {
  connection: GoogleConnectionService;
  signIn: GoogleSignInService;
  integrationUsers: IntegrationUserService;
  http: ModuleHttp;
  logger: Logger;
}

/** One callback request with Google's answer. */
export interface Callback {
  request: Request;
  response: Response;
  answer: ConsentAnswer;
}

/** HttpOnly, sent on Google's top-level redirect back (SameSite=Lax), Secure on HTTPS. */
export function consentCookie(publicOrigin: string): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: publicOrigin.startsWith("https:"),
    path: GOOGLE_CALLBACK_PATH,
    maxAge: CONSENT_LIFETIME_MS,
  };
}

export function cancelledOrFailed({ error }: ConsentAnswer): "cancelled" | "failed" {
  return error === "access_denied" ? "cancelled" : "failed";
}

/** The caller's security context; refuses a request without a session with FORBIDDEN. */
export async function requireSecurity(
  resolveSecurity: ModuleHttp["resolveSecurity"],
  request: Request,
  refusal: string,
): Promise<SecurityContext> {
  const { security } = await resolveSecurity(request.headers);
  if (!security) {
    throw new ApplicationError("FORBIDDEN", refusal);
  }
  return security;
}

/** An expected refusal as its status; anything else as a 500, logged without its contents. */
export function sendStartFailure(error: unknown, response: Response, logger: Logger): void {
  if (error instanceof ApplicationError) {
    sendApplicationError(error, response);
    return;
  }
  logger.error(failureFacts(error), "Google consent could not start");
  response.sendStatus(INTERNAL_SERVER_ERROR);
}

/** A refusal the flow expects is a warning; anything else, such as Postgres failing, an error. */
export function logRefusal(logger: Logger, error: unknown, failure: string, message: string): void {
  const expected = EXPECTED_REFUSALS.some((refusal) => error instanceof refusal);
  logger[expected ? "warn" : "error"]({ failure, ...failureFacts(error) }, message);
}

/**
 * What a log may say about a failure: its class, an HTTP answer's status and an application error's
 * code. Never its message or stack, which can carry Google's addresses (RULE31).
 */
function failureFacts(error: unknown): { kind: string; status?: number; code?: string } {
  return {
    kind: error instanceof Error ? error.name : typeof error,
    ...(error instanceof UnsuccessfulAnswerError && { status: error.status }),
    ...(error instanceof ApplicationError && { code: error.code }),
  };
}

const INTERNAL_SERVER_ERROR = 500;

/** The refusals a consent flow expects, each with its own answer to the person. */
const EXPECTED_REFUSALS = [
  ApplicationError,
  NotSuperAdminError,
  OtherWorkspaceError,
  UnknownGoogleAccountError,
  UserWriteRefusedError,
  EmailTakenError,
];
