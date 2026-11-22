import express, { type Request, Router } from "express";
import { z } from "zod";

import { sendApplicationError } from "../../../core/applicationError";
import type { ExtensionPairingService } from "../app";

/**
 * The extension's side of pairing, under `/api`, without a session: `POST /extension/pairings`
 * redeems a pairing code for a token, and `GET` and `DELETE /extension/pairing` read and unpair the
 * pairing that token, sent as `Authorization: Bearer <token>`, authenticates.
 */
export function extensionRouter(
  pairings: Pick<ExtensionPairingService, "redeemCode" | "readPairingOfToken" | "unpairWithToken">,
): Router {
  return Router()
    .post(
      "/extension/pairings",
      express.json({ limit: MAX_BODY_BYTES }),
      async (request, response) => {
        const { code, browser } = REDEMPTION.parse(request.body ?? {});
        try {
          const { token } = await pairings.redeemCode({ code, browser, now: new Date() });
          response.status(CREATED).json({ token });
        } catch (error) {
          sendApplicationError(error, response);
        }
      },
    )
    .get("/extension/pairing", async (request, response) => {
      const pairing = await pairings.readPairingOfToken({
        token: bearerTokenOf(request),
        now: new Date(),
      });
      if (!pairing) {
        response.sendStatus(UNAUTHORIZED);
        return;
      }
      response.json({ browser: pairing.browser, pairedAt: pairing.pairedAt.toISOString() });
    })
    .delete("/extension/pairing", async (request, response) => {
      const unpaired = await pairings.unpairWithToken(bearerTokenOf(request));
      response.sendStatus(unpaired ? NO_CONTENT : UNAUTHORIZED);
    });
}

const CREATED = 201;

const NO_CONTENT = 204;

const UNAUTHORIZED = 401;

/** Far above a pairing code and a browser label. */
const MAX_BODY_BYTES = "10kb";

/** Anything that is not a string redeems nothing, which the use case refuses as invalid. */
const REDEMPTION = z.object({
  code: z.string().catch(""),
  browser: z.string().catch(""),
});

/** The token of `Authorization: Bearer <token>`; empty without one, which authenticates nothing. */
function bearerTokenOf(request: Request): string {
  const [scheme, token] = (request.headers.authorization ?? "").split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : "";
}
