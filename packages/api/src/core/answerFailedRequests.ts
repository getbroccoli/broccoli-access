import type { ErrorRequestHandler, Request, Response } from "express";

import { ApplicationError, invalidInput, sendApplicationError } from "./applicationError";
import type { Logger } from "./logger";

/**
 * Answers every request that failed with an error, the JSON parser's included: an expected refusal,
 * an unreadable body or another client error as its status; anything else as a bare 500. Logs the
 * class only, since a parser or database message can quote the body, such as a pasted key (RULE31).
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
      // The path holds ids at most; the query, which can carry a code, stays out.
      path: request.path,
    },
    "Request failed",
  );
  response.sendStatus(INTERNAL_SERVER_ERROR);
}

/** Express's JSON parser could not parse the body. */
function isUnreadableBody(error: unknown): boolean {
  return (error as { type?: unknown } | null)?.type === "entity.parse.failed";
}

/** The 4xx status of a client error the body parser raised, such as 413 for a body too large. */
function clientErrorStatusOf(error: unknown): number | undefined {
  const { status, expose } = (error ?? {}) as { status?: unknown; expose?: unknown };
  return expose === true && typeof status === "number" && status < INTERNAL_SERVER_ERROR
    ? status
    : undefined;
}
