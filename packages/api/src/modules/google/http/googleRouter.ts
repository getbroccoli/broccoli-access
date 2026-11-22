import { parseCookies } from "better-auth/cookies";
import express, { type CookieOptions, type Request, type Response, Router } from "express";
import { z } from "zod";

import { ApplicationError, sendApplicationError } from "../../../core/applicationError";
import { readSetupToken } from "../../../core/instance";
import type { Logger } from "../../../core/logger";
import type { ModuleHttp } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { UnsuccessfulAnswerError } from "../../../utils";
import type { GoogleConnectionService, GoogleSignInService } from "../app";
import { GOOGLE_CALLBACK_PATH, NotSuperAdminError, UnknownGoogleAccountError } from "../domain";
import { CONSENT_LIFETIME_MS, type ConsentState, consentFlowOf } from "../helpers";

/**
 * Google's side of setup and sign-in, under `/api`: `POST /google/connect` starts the admin's
 * consent for the browser holding setup, `GET /google/sign-in` sends a visitor to sign in with
 * Google, and `GET /google/callback` takes Google's answer to either, as its `state` says, signs
 * the person in and sends them on, or back with why it failed.
 */
export function googleRouter(
  { connection, signIn }: { connection: GoogleConnectionService; signIn: GoogleSignInService },
  http: ModuleHttp,
  logger: Logger,
): Router {
  const routes = { connection, signIn, http, logger };
  const { resolveSecurity, publicOrigin } = http;
  return Router()
    .post("/google/connect", express.json({ limit: MAX_BODY_BYTES }), async (request, response) => {
      const { clientId, clientSecret } = CONNECTION_START.parse(request.body ?? {});
      try {
        const security = await requireSecurity(resolveSecurity, request);
        response.json(
          await connection.startConnection(security, {
            clientId,
            clientSecret,
            publicOrigin: await publicOrigin(request),
            setupToken: readSetupToken(request.headers.cookie),
            now: new Date(),
          }),
        );
      } catch (error) {
        sendStartFailure(error, response, logger);
      }
    })
    .get("/google/sign-in", async (request, response) => {
      try {
        const origin = await publicOrigin(request);
        const { authorizationUrl, browserToken } = await signIn.startSignIn({
          publicOrigin: origin,
          now: new Date(),
        });
        response.cookie(SIGN_IN_COOKIE, browserToken, signInCookie(origin));
        response.redirect(302, authorizationUrl);
      } catch (error) {
        logRefusal(logger, error, "failed", "Google sign-in could not start");
        sendBackToLogin(response, "failed");
      }
    })
    .get("/google/callback", async (request, response) => {
      const answer = CONSENT_ANSWER.parse(request.query);
      const finish = consentFlowOf(answer.state ?? "") === SIGN_IN ? finishSignIn : finishConsent;
      await finish(routes, { request, response, answer });
    });
}

const INTERNAL_SERVER_ERROR = 500;

/** Far above two Google client credentials. */
const MAX_BODY_BYTES = "10kb";

const SCAN_PAGE = "/setup/scan";

const TODAY = "/";

/** The flow of a sign-in's `state`, which the callback hands to sign-in. */
const SIGN_IN: ConsentState["flow"] = "sign_in_with_google";

/** Binds a sign-in's `state` to the browser that started it; only the callback receives it. */
const SIGN_IN_COOKIE = "broccoli_access_google_sign_in";

const CONNECTION_START = z.object({
  clientId: z.string().catch(""),
  clientSecret: z.string().catch(""),
});

/** Google's redirect: a code, or an error such as `access_denied` when the person cancels. */
const CONSENT_ANSWER = z.object({
  code: z.string().optional().catch(undefined),
  state: z.string().optional().catch(undefined),
  error: z.string().optional().catch(undefined),
});

type ConsentAnswer = z.infer<typeof CONSENT_ANSWER>;

/** What the callback's handlers use. */
interface GoogleRoutes {
  connection: GoogleConnectionService;
  signIn: GoogleSignInService;
  http: ModuleHttp;
  logger: Logger;
}

/** One callback request with Google's answer. */
interface Callback {
  request: Request;
  response: Response;
  answer: ConsentAnswer;
}

/** Why the connect step failed, as the setup page shows it. */
type ConnectFailure = "cancelled" | "not_super_admin" | "failed";

/** Why signing in failed, as the login page shows it. */
type SignInFailure = "cancelled" | "not_allowed" | "failed";

/** Setup's consent: signs the new owner in and sends them to the scan, or back to the connect step. */
async function finishConsent(
  { connection, http, logger }: GoogleRoutes,
  { request, response, answer }: Callback,
): Promise<void> {
  const { resolveSecurity, publicOrigin, startSession } = http;
  if (answer.code === undefined || answer.state === undefined) {
    const failure = cancelledOrFailed(answer);
    logger.info({ failure }, "Google consent ended without a code");
    sendBackToConnect(response, failure);
    return;
  }
  try {
    const security = await requireSecurity(resolveSecurity, request);
    const { userId } = await connection.finishConsent(security, {
      code: answer.code,
      state: answer.state,
      publicOrigin: await publicOrigin(request),
      setupToken: readSetupToken(request.headers.cookie),
      now: new Date(),
    });
    response.append("Set-Cookie", await startSession(userId));
    response.redirect(302, SCAN_PAGE);
  } catch (error) {
    const failure = error instanceof NotSuperAdminError ? "not_super_admin" : "failed";
    logRefusal(logger, error, failure, "Google consent refused");
    sendBackToConnect(response, failure);
  }
}

/** A sign-in: signs the person in and sends them to Today, or back to login. */
async function finishSignIn(
  { signIn, http, logger }: GoogleRoutes,
  { request, response, answer }: Callback,
): Promise<void> {
  const origin = await http.publicOrigin(request);
  response.clearCookie(SIGN_IN_COOKIE, signInCookie(origin));
  if (answer.code === undefined || answer.state === undefined) {
    const failure = cancelledOrFailed(answer);
    logger.info({ failure }, "Google sign-in ended without a code");
    sendBackToLogin(response, failure);
    return;
  }
  try {
    const { userId } = await signIn.finishSignIn({
      code: answer.code,
      state: answer.state,
      publicOrigin: origin,
      browserToken: parseCookies(request.headers.cookie ?? "").get(SIGN_IN_COOKIE) ?? null,
      now: new Date(),
    });
    response.append("Set-Cookie", await http.startSession(userId));
    logger.info({ userId }, "Signed in with Google");
    response.redirect(302, TODAY);
  } catch (error) {
    const failure = error instanceof UnknownGoogleAccountError ? "not_allowed" : "failed";
    logRefusal(logger, error, failure, "Google sign-in refused");
    sendBackToLogin(response, failure);
  }
}

/** HttpOnly, sent on Google's top-level redirect back (SameSite=Lax), Secure on HTTPS. */
function signInCookie(publicOrigin: string): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: publicOrigin.startsWith("https:"),
    path: GOOGLE_CALLBACK_PATH,
    maxAge: CONSENT_LIFETIME_MS,
  };
}

function cancelledOrFailed({ error }: ConsentAnswer): "cancelled" | "failed" {
  return error === "access_denied" ? "cancelled" : "failed";
}

async function requireSecurity(
  resolveSecurity: ModuleHttp["resolveSecurity"],
  request: Request,
): Promise<SecurityContext> {
  const { security } = await resolveSecurity(request.headers);
  if (!security) {
    throw new ApplicationError("FORBIDDEN", "Only the browser holding setup can connect Google.");
  }
  return security;
}

/** An expected refusal as its status; anything else as a 500, logged without its contents. */
function sendStartFailure(error: unknown, response: Response, logger: Logger): void {
  if (error instanceof ApplicationError) {
    sendApplicationError(error, response);
    return;
  }
  logger.error(failureFacts(error), "Google consent could not start");
  response.sendStatus(INTERNAL_SERVER_ERROR);
}

/** A refusal the flow expects is a warning; anything else, such as Postgres failing, an error. */
function logRefusal(
  logger: Logger,
  error: unknown,
  failure: ConnectFailure | SignInFailure,
  message: string,
): void {
  const expected =
    error instanceof ApplicationError ||
    error instanceof NotSuperAdminError ||
    error instanceof UnknownGoogleAccountError;
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

function sendBackToConnect(response: Response, failure: ConnectFailure): void {
  response.redirect(302, `/setup?connectError=${failure}`);
}

function sendBackToLogin(response: Response, failure: SignInFailure): void {
  response.redirect(302, `/login?signInError=${failure}`);
}
