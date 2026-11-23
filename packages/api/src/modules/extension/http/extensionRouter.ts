import express, { type Request, Router } from "express";
import { z } from "zod";

import type { ExtensionHandOverService, ExtensionPairingService } from "../app";

/**
 * The extension's calls, under `/api`, without a session: `POST /extension/pairings` redeems a
 * pairing code for a token; with that token as `Authorization: Bearer <token>`, `GET` and
 * `DELETE /extension/pairing` read and unpair its pairing, and `GET` and
 * `POST /extension/app-sessions/<connector>` say what to collect for a connector's app session
 * and hand it over.
 */
// eslint-disable-next-line broccoli-access/max-lines-per-function -- a table of routes.
export function extensionRouter({
  pairings,
  handOvers,
}: {
  pairings: Pick<ExtensionPairingService, "redeemCode" | "readPairingOfToken" | "unpairWithToken">;
  handOvers: ExtensionHandOverService;
}): Router {
  return Router()
    .post(
      "/extension/pairings",
      express.json({ limit: MAX_BODY_BYTES }),
      async (request, response) => {
        const { code, browser } = REDEMPTION.parse(request.body);
        const { token } = await pairings.redeemCode({ code, browser, now: new Date() });
        response.status(CREATED).json({ token });
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
    })
    .get("/extension/app-sessions/:connector", async (request, response) => {
      const appSessionRequest = await handOvers.describeAppSession({
        token: bearerTokenOf(request),
        connector: request.params.connector,
        now: new Date(),
      });
      if (!appSessionRequest) {
        response.sendStatus(UNAUTHORIZED);
        return;
      }
      response.json(appSessionRequest);
    })
    .post(
      "/extension/app-sessions/:connector",
      express.json({ limit: MAX_APP_SESSION_BYTES }),
      async (request, response) => {
        const handedOver = await handOvers.handOverAppSession({
          ...HAND_OVER.parse(request.body),
          token: bearerTokenOf(request),
          connector: request.params.connector,
          now: new Date(),
        });
        response.sendStatus(handedOver ? NO_CONTENT : UNAUTHORIZED);
      },
    );
}

const CREATED = 201;

const NO_CONTENT = 204;

const UNAUTHORIZED = 401;

/** Far above a pairing code and a browser label. */
const MAX_BODY_BYTES = "10kb";

/**
 * Room for an app's cookies and the values its page keeps, such as Slack's local configuration,
 * small enough that the sealed session, a third larger in base64, still fits the 100 kB GraphQL
 * body that Connect sends it back in.
 */
const MAX_APP_SESSION_BYTES = "64kb";

/** A hand-over without a request id hands over nothing, which the use case refuses as invalid. */
const HAND_OVER = z
  .object({ requestId: z.string().catch(""), appSession: z.unknown() })
  .catch({ requestId: "", appSession: null });

/** A body that is not an object of strings redeems nothing, which the use case refuses as invalid. */
const REDEMPTION = z
  .object({ code: z.string().catch(""), browser: z.string().catch("") })
  .catch({ code: "", browser: "" });

/** The token of `Authorization: Bearer <token>`; empty without one, which authenticates nothing. */
function bearerTokenOf(request: Request): string {
  const [scheme, token] = (request.headers.authorization ?? "").split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : "";
}
