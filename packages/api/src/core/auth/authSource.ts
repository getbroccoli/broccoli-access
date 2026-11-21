import { toNodeHandler } from "better-auth/node";
import type { RequestHandler } from "express";

import type { Auth } from "./createBetterAuth";

/** This process's Better Auth. */
export interface AuthSource {
  current(): Promise<Auth | null>;
}

/** Better Auth built at startup. */
export function fixedAuth(auth: Auth): AuthSource {
  return { current: () => Promise.resolve(auth) };
}

/** Serves `/api/auth/*`. Mount it before any body parser: Better Auth reads the raw body. */
export function authHandler(auth: AuthSource): RequestHandler {
  return async (request, response) => {
    const current = await auth.current();
    if (!current) {
      throw new Error("Auth was requested before the instance was assigned");
    }
    await toNodeHandler(current)(request, response);
  };
}
