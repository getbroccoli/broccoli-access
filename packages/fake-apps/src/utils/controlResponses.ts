import type { RequestHandler, Response } from "express";
import { z } from "zod";

/**
 * Control endpoints have no authentication, so they refuse browsers, which any site can make
 * post a form to them. Browsers send `Origin` with every cross-site POST; tests, curl and agents
 * send none.
 */
export const refuseBrowsers: RequestHandler = (request, response, next) => {
  if (request.get("origin") === undefined) return next();
  response
    .status(403)
    .json({ error: "The control endpoints refuse requests with an Origin header" });
};

export function invalidBody(response: Response, error: z.ZodError): void {
  response.status(400).json({ error: z.prettifyError(error) });
}

export function notFound(response: Response, message: string): void {
  response.status(404).json({ error: message });
}
