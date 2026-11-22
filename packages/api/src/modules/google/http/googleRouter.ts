import express, { type Request, type Response, Router } from "express";
import { z } from "zod";

import { ApplicationError, sendApplicationError } from "../../../core/applicationError";
import { readSetupToken } from "../../../core/instance";
import type { Logger } from "../../../core/logger";
import type { ModuleHttp } from "../../../core/moduleManifest";
import type { SecurityContext } from "../../../core/security";
import { UnsuccessfulAnswerError } from "../../../utils";
import type { GoogleConnectionService } from "../app";
import { NotSuperAdminError } from "../domain";

/**
 * Google's side of setup, under `/api`: `POST /google/connect` starts the admin's consent for the
 * browser holding setup, and `GET /google/callback` takes Google's answer, signs the new owner in
 * and sends them to the scan, or back to the connect step with why it failed.
 */
export function googleRouter(
  google: GoogleConnectionService,
  { resolveSecurity, publicOrigin, startSession }: ModuleHttp,
  logger: Logger,
): Router {
  return Router()
    .post("/google/connect", express.json({ limit: MAX_BODY_BYTES }), async (request, response) => {
      const { clientId, clientSecret } = CONNECTION_START.parse(request.body ?? {});
      try {
        const security = await requireSecurity(resolveSecurity, request);
        response.json(
          await google.startConnection(security, {
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
    .get("/google/callback", async (request, response) => {
      const answer = CONSENT_ANSWER.parse(request.query);
      if (answer.code === undefined || answer.state === undefined) {
        const failure = answer.error === "access_denied" ? "cancelled" : "failed";
        logger.info({ failure }, "Google consent ended without a code");
        sendBackToConnect(response, failure);
        return;
      }
      try {
        const security = await requireSecurity(resolveSecurity, request);
        const { userId } = await google.finishConsent(security, {
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
        logRefusal(logger, error, failure);
        sendBackToConnect(response, failure);
      }
    });
}

const INTERNAL_SERVER_ERROR = 500;

/** Far above two Google client credentials. */
const MAX_BODY_BYTES = "10kb";

const SCAN_PAGE = "/setup/scan";

const CONNECTION_START = z.object({
  clientId: z.string().catch(""),
  clientSecret: z.string().catch(""),
});

/** Google's redirect: a code, or an error such as `access_denied` when the admin cancels. */
const CONSENT_ANSWER = z.object({
  code: z.string().optional().catch(undefined),
  state: z.string().optional().catch(undefined),
  error: z.string().optional().catch(undefined),
});

/** Why the connect step failed, as the setup page shows it. */
type ConnectFailure = "cancelled" | "not_super_admin" | "failed";

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
function logRefusal(logger: Logger, error: unknown, failure: ConnectFailure): void {
  const expected = error instanceof ApplicationError || error instanceof NotSuperAdminError;
  logger[expected ? "warn" : "error"](
    { failure, ...failureFacts(error) },
    "Google consent refused",
  );
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
