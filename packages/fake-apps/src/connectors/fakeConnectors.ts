import express, { type ErrorRequestHandler } from "express";

import { listen } from "../utils";
import { connectorCallRoutes } from "./connectorCalls";
import { seededState, type FakeConnectorsContext } from "./connectorsState";
import { controlRoutes } from "./controls";
import { slackSignInRoutes } from "./slack";

export interface FakeConnectorsOptions {
  /** Interface to listen on; defaults to `127.0.0.1`, so only this machine reaches the controls. */
  host?: string;
  /** Defaults to a free port. */
  port?: number;
  /** How long each call's answer takes, at start and after reset; defaults to a short delay. */
  delayMs?: number;
  /** Receives one line per call; silent by default. */
  log?: (line: string) => void;
}

export interface RunningFakeConnectors {
  /** The address it listens on, such as `http://127.0.0.1:<free port>`. */
  url: string;
  stop: () => Promise<void>;
}

/**
 * Starts a fake connectors container serving Acme's Slack and Linear over the connector
 * contract, by default on a free local port.
 */
export async function startFakeConnectors(
  options: FakeConnectorsOptions = {},
): Promise<RunningFakeConnectors> {
  const delayMs = options.delayMs ?? SHORT_DELAY_MS;
  const { server, url, stop } = await listen(options.host ?? "127.0.0.1", options.port);
  const context: FakeConnectorsContext = {
    state: seededState(delayMs),
    reset: () => {
      context.state = seededState(delayMs);
    },
    log: options.log ?? (() => {}),
  };
  const app = express();
  app.disable("x-powered-by");
  app.use(connectorCallRoutes(context), slackSignInRoutes(context), controlRoutes(context));
  app.use(answerFailedRequest(context));
  server.on("request", app);
  return { url, stop };
}

/** Long enough that a change's progress state shows, short enough not to slow a run. */
const SHORT_DELAY_MS = 250;

/**
 * Express's own handler logs and answers with the parser's message, which quotes the body and so
 * any secret in it (RULE31): answer and log the status only.
 */
function answerFailedRequest(context: FakeConnectorsContext): ErrorRequestHandler {
  // Express finds error handlers by their four parameters, so `next` stays though unused.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (error: { status?: unknown }, _request, response, _next) => {
    const status = typeof error.status === "number" && error.status < 500 ? error.status : 500;
    context.log(JSON.stringify({ outcome: "failed", status }));
    response
      .status(status)
      .json({ error: status === 500 ? "The fake failed" : "Unreadable request" });
  };
}
