import type { ErrorRequestHandler, Request, Response } from "express";

import { ApplicationError, invalidInput, sendApplicationError } from "./applicationError";
import type { Logger } from "./logger";

/**
 * Answers a request that failed before its response started: an expected refusal or another client
 * error as its status, an unreadable body as invalid input, anything else as a bare 500. Logs only
 * a 500's error class, method and route template, since a message or path can quote what the caller
 * sent, such as a pasted key (RULE31).
 */
export function answerFailedRequests(logger: Logger): ErrorRequestHandler {
  return (error: unknown, request, response, next) => {
    // Express's own handler ends a response that has already started.
    if (response.headersSent) {
      next(error);
      return;
    }
    sendFailure(error, request, response, logger);
  };
}

const BAD_REQUEST = 400;

const INTERNAL_SERVER_ERROR = 500;

function sendFailure(error: unknown, request: Request, response: Response, logger: Logger): void {
  if (error instanceof ApplicationError) {
    sendApplicationError(error, response);
    return;
  }
  if (isUnreadableBody(error)) {
    sendApplicationError(invalidInput([{ field: "body", code: "invalid" }]), response);
    return;
  }
  const clientErrorStatus = clientErrorStatusOf(error);
  if (clientErrorStatus) {
    response.sendStatus(clientErrorStatus);
    return;
  }
  logger.error(
    {
      kind: error instanceof Error ? error.name : typeof error,
      method: request.method,
      // The template from the code, such as `/files/:id`; absent when no route matched.
      route: (request.route as { path?: string } | undefined)?.path,
    },
    "Request failed",
  );
  response.sendStatus(INTERNAL_SERVER_ERROR);
}

/** Express's JSON parser could not parse the body. */
function isUnreadableBody(error: unknown): boolean {
  return (error as { type?: unknown } | null)?.type === "entity.parse.failed";
}

/** The 4xx status a client error carries, such as 413 for a large body or 400 for a bad escape. */
function clientErrorStatusOf(error: unknown): number | undefined {
  const { status } = (error ?? {}) as { status?: unknown };
  return typeof status === "number" && status >= BAD_REQUEST && status < INTERNAL_SERVER_ERROR
    ? status
    : undefined;
}
