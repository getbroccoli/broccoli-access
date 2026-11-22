import { toNodeHandler } from "better-auth/node";
import type { RequestHandler } from "express";

import type { Auth } from "./createBetterAuth";

/** Serves `/api/auth/*`. Mount it before any body parser: Better Auth reads the raw body. */
export function authHandler(auth: Auth): RequestHandler {
  const handle = toNodeHandler(auth);
  return async (request, response) => {
    await handle(request, response);
  };
}
