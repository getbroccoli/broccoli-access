import { type RequestHandler, Router } from "express";
import { rateLimit } from "express-rate-limit";

import { requireSameOriginWrites } from "../helpers";

/** Setup requests per address and minute: enough for a person, little for guessing. */
const SETUP_ATTEMPTS_PER_MINUTE = 10;
const SETUP_START_PATH = "/api/auth/setup/start";

/**
 * Guards the setup start of the Better Auth plugin before it runs: a limit per socket address,
 * and the same-origin check Better Auth skips for a request without cookies, such as the first
 * claim of setup.
 */
export function setupRouter(publicUrl?: string): Router {
  const limit = limitPerMinute(SETUP_ATTEMPTS_PER_MINUTE);
  const sameOrigin = requireSameOriginWrites(publicUrl);
  const guard: RequestHandler = (request, response, next) => {
    void limit(request, response, () => {
      sameOrigin(request, response, next);
    });
  };
  return Router().post("/api/auth/{*path}", (request, response, next) => {
    // Better Auth resolves dot segments, so `/api/auth/./setup` must not skip the guard.
    const path = new URL(request.originalUrl, "http://localhost").pathname;
    if (path === SETUP_START_PATH) {
      guard(request, response, next);
    } else {
      next();
    }
  });
}

function limitPerMinute(limit: number) {
  return rateLimit({
    windowMs: 60_000,
    limit,
    // Without a trusted proxy the socket address counts; a forwarded header is ignored.
    validate: { xForwardedForHeader: false },
  });
}
