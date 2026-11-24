import { parseCookies } from "better-auth/cookies";
import express, { type Request, type Response, Router } from "express";

import { readSetupToken } from "../../../core/instance";
import type { Logger } from "../../../core/logger";
import type { ModuleHttp } from "../../../core/moduleManifest";
import { NotSuperAdminError, OtherWorkspaceError, UnknownGoogleAccountError } from "../domain";
import { type ConsentState, consentFlowOf } from "../helpers";
import {
  type Callback,
  cancelledOrFailed,
  consentCookie,
  type GoogleRoutes,
  logRefusal,
  requireSecurity,
  sendStartFailure,
} from "./consentHandling";
import { hasConsentAnswer, parseAnswer, parseStart } from "./googleConsentInput";
import {
  finishIntegrationUserCreation,
  startIntegrationUserCreation,
} from "./integrationUserRoutes";

/**
 * Google's side of setup, sign-in and Settings, under `/api`: `POST /google/connect` starts the
 * admin's consent for the browser holding setup, `GET /google/sign-in` sends a visitor to sign in
 * with Google, `POST /google/change-app` starts the owner's consent for a new Google app, and
 * `GET /google/callback` takes Google's answer to any of them, as its `state` says, and sends the
 * person on, or back with why it failed.
 */
export function googleRouter(
  services: Pick<GoogleRoutes, "connection" | "signIn" | "integrationUsers">,
  http: ModuleHttp,
  logger: Logger,
): Router {
  const routes = { ...services, http, logger };
  const { signIn } = services;
  const { publicOrigin } = http;
  return Router()
    .post("/google/connect", express.json({ limit: MAX_BODY_BYTES }), (request, response) =>
      startConnection(routes, request, response),
    )
    .get("/google/sign-in", async (request, response) => {
      try {
        const origin = await publicOrigin(request);
        const { authorizationUrl, browserToken } = await signIn.startSignIn({
          publicOrigin: origin,
          now: new Date(),
        });
        response.cookie(SIGN_IN_COOKIE, browserToken, consentCookie(origin));
        response.redirect(302, authorizationUrl);
      } catch (error) {
        logRefusal(logger, error, "failed", "Google sign-in could not start");
        sendBackToLogin(response, "failed");
      }
    })
    .post("/google/change-app", express.json({ limit: MAX_BODY_BYTES }), (request, response) =>
      startAppChange(routes, request, response),
    )
    .post(
      "/google/integration-user",
      express.json({ limit: MAX_BODY_BYTES }),
      (request, response) => startIntegrationUserCreation(routes, request, response),
    )
    .get("/google/callback", async (request, response) => {
      const answer = parseAnswer(request.query);
      await finisherOf(consentFlowOf(answer.state ?? ""))(routes, { request, response, answer });
    });
}

/** Far above two Google client credentials. */
const MAX_BODY_BYTES = "10kb";

const SCAN_PAGE = "/setup/scan";

const HOME = "/";

const CONNECTIONS_PAGE = "/settings/connections";

const CHANGE_APP_PAGE = "/settings/connections/google-app";

const NOT_SETUP_HOLDER = "Only the browser holding setup can connect Google.";

const NOT_OWNER = "Only the owner can change the Google app.";

/** Binds a sign-in's `state` to the browser that started it; only the callback receives it. */
const SIGN_IN_COOKIE = "broccoli_access_google_sign_in";

/** Binds a Google app change's `state` to the browser that started it, like `SIGN_IN_COOKIE`. */
const CHANGE_APP_COOKIE = "broccoli_access_google_change_app";

/** Why the connect step failed, as the setup page shows it. */
type ConnectFailure = "cancelled" | "not_super_admin" | "failed";

/** Why signing in failed, as the login page shows it. */
type SignInFailure = "cancelled" | "not_allowed" | "failed";

/** Why changing the Google app failed, as its page shows it. */
type AppChangeFailure = "cancelled" | "not_super_admin" | "other_workspace" | "failed";

/** The callback's handler for the flow a `state` names; setup's takes every other one. */
function finisherOf(flow: string): (routes: GoogleRoutes, callback: Callback) => Promise<void> {
  switch (flow) {
    case "sign_in_with_google" satisfies ConsentState["flow"]:
      return finishSignIn;
    case "change_google_app" satisfies ConsentState["flow"]:
      return finishAppChange;
    case "create_integration_user" satisfies ConsentState["flow"]:
      return finishIntegrationUserCreation;
    default:
      return finishConsent;
  }
}

/** Starts the admin's consent for the browser holding setup. */
async function startConnection(
  { connection, http, logger }: GoogleRoutes,
  request: Request,
  response: Response,
): Promise<void> {
  try {
    const { clientId, clientSecret, googleApp } = parseStart(request.body);
    const security = await requireSecurity(http.resolveSecurity, request, NOT_SETUP_HOLDER);
    response.json(
      await connection.startConnection(security, {
        googleApp,
        clientId,
        clientSecret,
        publicOrigin: await http.publicOrigin(request),
        browserOrigin: request.headers.origin,
        setupToken: readSetupToken(request.headers.cookie),
        now: new Date(),
      }),
    );
  } catch (error) {
    sendStartFailure(error, response, logger);
  }
}

/** Setup's consent: signs the new owner in and sends them to the scan, or back to the connect step. */
async function finishConsent(
  { connection, http, logger }: GoogleRoutes,
  { request, response, answer }: Callback,
): Promise<void> {
  const { resolveSecurity, publicOrigin, startSession } = http;
  if (!hasConsentAnswer(answer)) {
    const failure = cancelledOrFailed(answer);
    logger.info({ failure }, "Google consent ended without an answer");
    sendBackToConnect(response, failure);
    return;
  }
  try {
    const security = await requireSecurity(resolveSecurity, request, NOT_SETUP_HOLDER);
    const { userId } = await connection.finishConsent(security, {
      code: answer.code,
      handle: answer.handle,
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

/** A sign-in: signs the person in and sends them home, or back to login. */
async function finishSignIn(
  { signIn, http, logger }: GoogleRoutes,
  { request, response, answer }: Callback,
): Promise<void> {
  const origin = await http.publicOrigin(request);
  if (!hasConsentAnswer(answer)) {
    const failure = cancelledOrFailed(answer);
    logger.info({ failure }, "Google sign-in ended without an answer");
    sendBackToLogin(response, failure);
    return;
  }
  try {
    const { userId } = await signIn.finishSignIn({
      code: answer.code,
      handle: answer.handle,
      state: answer.state,
      publicOrigin: origin,
      browserToken: parseCookies(request.headers.cookie ?? "").get(SIGN_IN_COOKIE) ?? null,
      now: new Date(),
    });
    response.append("Set-Cookie", await http.startSession(userId));
    logger.info({ userId }, "Signed in with Google");
    response.redirect(302, HOME);
  } catch (error) {
    const failure = error instanceof UnknownGoogleAccountError ? "not_allowed" : "failed";
    logRefusal(logger, error, failure, "Google sign-in refused");
    sendBackToLogin(response, failure);
  }
}

/** Starts the owner's consent for a new Google app, binding its `state` to this browser. */
async function startAppChange(
  { connection, http, logger }: GoogleRoutes,
  request: Request,
  response: Response,
): Promise<void> {
  try {
    const { clientId, clientSecret, googleApp } = parseStart(request.body);
    const security = await requireSecurity(http.resolveSecurity, request, NOT_OWNER);
    const origin = await http.publicOrigin(request);
    const { authorizationUrl, browserToken } = await connection.startAppChange(security, {
      googleApp,
      clientId,
      clientSecret,
      publicOrigin: origin,
      browserOrigin: request.headers.origin,
      now: new Date(),
    });
    response.cookie(CHANGE_APP_COOKIE, browserToken, consentCookie(origin));
    response.json({ authorizationUrl });
  } catch (error) {
    sendStartFailure(error, response, logger);
  }
}

/** The owner's new Google app: back to Connections, or to the change's page with why it failed. */
async function finishAppChange(
  { connection, http, logger }: GoogleRoutes,
  { request, response, answer }: Callback,
): Promise<void> {
  const origin = await http.publicOrigin(request);
  if (!hasConsentAnswer(answer)) {
    const failure = cancelledOrFailed(answer);
    logger.info({ failure }, "Google app change ended without an answer");
    sendBackToAppChange(response, failure);
    return;
  }
  try {
    const security = await requireSecurity(http.resolveSecurity, request, NOT_OWNER);
    await connection.finishAppChange(security, {
      code: answer.code,
      handle: answer.handle,
      state: answer.state,
      publicOrigin: origin,
      browserToken: parseCookies(request.headers.cookie ?? "").get(CHANGE_APP_COOKIE) ?? null,
      now: new Date(),
    });
    response.redirect(302, CONNECTIONS_PAGE);
  } catch (error) {
    const failure = appChangeFailureOf(error);
    logRefusal(logger, error, failure, "Google app change refused");
    sendBackToAppChange(response, failure);
  }
}

function appChangeFailureOf(error: unknown): AppChangeFailure {
  if (error instanceof OtherWorkspaceError) {
    return "other_workspace";
  }
  return error instanceof NotSuperAdminError ? "not_super_admin" : "failed";
}

function sendBackToConnect(response: Response, failure: ConnectFailure): void {
  response.redirect(302, `/setup?connectError=${failure}`);
}

function sendBackToLogin(response: Response, failure: SignInFailure): void {
  response.redirect(302, `/login?signInError=${failure}`);
}

function sendBackToAppChange(response: Response, failure: AppChangeFailure): void {
  response.redirect(302, `${CHANGE_APP_PAGE}?changeError=${failure}`);
}
