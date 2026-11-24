import { setTimeout as sleep } from "node:timers/promises";

import type {
  AccountsListAnswer,
  ActionRunAnswer,
  ConnectionSignInAnswer,
  ConnectionTestAnswer,
  ConnectorCall,
  ConnectorErrorAnswer,
  ConnectorErrorCode,
  IntegrationUserCall,
  IntegrationUserSetupAnswer,
} from "@broccoli-access/connector-contract";
import type { RequestHandler, Response } from "express";
import { z } from "zod";

import {
  failureKeyOf,
  type ConnectorsState,
  type FakeConnectorKey,
  type FakeConnectorsContext,
} from "./connectorsState";

/** What a request that matches its schema leads to. */
export type CallPlan =
  /** HTTP 400, with the reason. */
  | { refused: string }
  | {
      /** The connector whose planned failures the call uses; none for a call without one. */
      connector?: FakeConnectorKey;
      /** Logged with the call. */
      action?: string;
      /** Answers as the app would, from the state the call began with. */
      answer: (state: ConnectorsState) => CallAnswer | Promise<CallAnswer>;
    };

export type CallAnswer =
  | ConnectionTestAnswer
  | AccountsListAnswer
  | ActionRunAnswer
  | IntegrationUserSetupAnswer
  | ConnectionSignInAnswer
  | ConnectorErrorAnswer;

/**
 * Answers one contract call: refuses what the contract answers with HTTP 400, waits the delay,
 * then answers a planned failure, or else as `plan` says.
 */
export function answerCall<R>(
  context: FakeConnectorsContext,
  call: ConnectorCall | IntegrationUserCall,
  schema: z.ZodType<R, unknown>,
  plan: (request: R) => CallPlan,
): RequestHandler {
  return async (request, response) => {
    const body = schema.safeParse(request.body);
    if (!body.success) return refuse(context, response, call, z.prettifyError(body.error));
    const planned = plan(body.data);
    if ("refused" in planned) return refuse(context, response, call, planned.refused);
    // A reset during the delay replaces the state, and the call keeps acting on the one it began with.
    const state = context.state;
    if (!(await waitUnlessClosed(response, state.delayMs))) return;
    const failure = takePlannedFailure(state, failureKeyOf(call, planned.connector));
    const result = failure === undefined ? await planned.answer(state) : errorAnswer(failure);
    const { connector, action } = planned;
    context.log(JSON.stringify({ connector, call, action, outcome: outcomeOf(result) }));
    response.json(result);
  };
}

export function errorAnswer(code: ConnectorErrorCode): ConnectorErrorAnswer {
  return { error: { code } };
}

function takePlannedFailure(state: ConnectorsState, key: string): ConnectorErrorCode | undefined {
  const failure = state.failures.get(key);
  if (failure === undefined) return undefined;
  failure.remaining -= 1;
  if (failure.remaining === 0) state.failures.delete(key);
  return failure.code;
}

/** False when the caller went away first, so nothing answers a closed connection. */
async function waitUnlessClosed(response: Response, delayMs: number): Promise<boolean> {
  const closed = new AbortController();
  response.on("close", () => closed.abort());
  try {
    await sleep(delayMs, undefined, { signal: closed.signal });
    return true;
  } catch {
    return false;
  }
}

function outcomeOf(answer: CallAnswer): string {
  return "error" in answer ? answer.error.code : "ok";
}

/** Logs only the call: the body may carry secrets and emails. */
function refuse(
  context: FakeConnectorsContext,
  response: Response,
  call: string,
  message: string,
): void {
  context.log(JSON.stringify({ call, outcome: "refused" }));
  response.status(400).json({ error: message });
}
