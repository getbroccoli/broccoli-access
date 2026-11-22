import { setTimeout as sleep } from "node:timers/promises";

import {
  ACCOUNTS_LIST_REQUEST,
  ACTION_RUN_REQUEST,
  CONNECTION_TEST_REQUEST,
  type AccountsListAnswer,
  type AccountValues,
  type ActionRunAnswer,
  type ActionRunRequest,
  type ConnectionTestAnswer,
  type ConnectionTestRequest,
  type ConnectorCall,
  type ConnectorErrorAnswer,
  type ConnectorErrorCode,
} from "@broccoli-access/connector-contract";
import express, { Router, type RequestHandler, type Response } from "express";
import { z } from "zod";

import type { SeedMember } from "../seed";
import { membersOf, type ConnectorsState, type FakeConnectorsContext } from "./connectorsState";
import type { FakeConnector } from "./fakeConnector";
import { FAKE_CONNECTORS, findConnector } from "./fakeConnectorList";

/** The connector contract's calls, answered from the fake's memory (docs/connector-contract.md). */
export function connectorCallRoutes(context: FakeConnectorsContext): Router {
  return Router()
    .get("/v1/connectors", (_request, response) => {
      response.json({ connectors: FAKE_CONNECTORS.map(({ description }) => description) });
    })
    .use("/v1", express.json())
    .post(
      "/v1/connections/test",
      answerCall(context, "connections/test", CONNECTION_TEST_REQUEST, testConnection),
    )
    .post("/v1/accounts/list", answerCall(context, "accounts/list", LIST_REQUEST, listAccounts))
    .post("/v1/actions/run", answerCall(context, "actions/run", ACTION_RUN_REQUEST, runAction));
}

/** Small enough that Acme's 41 Slack members take three pages, so callers page for real. */
const PAGE_SIZE = 20;

/** An opaque cursor: the next page's offset, in base64url. */
const PAGE_CURSOR = z
  .string()
  .transform((cursor) => Number(Buffer.from(cursor, "base64url").toString("utf8")))
  .pipe(z.int().nonnegative());

const LIST_REQUEST = ACCOUNTS_LIST_REQUEST.extend({ cursor: PAGE_CURSOR.nullable() });

type ListRequest = z.infer<typeof LIST_REQUEST>;

type CallRequest = ConnectionTestRequest | ListRequest | ActionRunRequest;

type Answer = ConnectionTestAnswer | AccountsListAnswer | ActionRunAnswer | ConnectorErrorAnswer;

/** Refuses what the contract answers with HTTP 400, waits the delay, then answers as the app would. */
function answerCall<R extends CallRequest>(
  context: FakeConnectorsContext,
  call: ConnectorCall,
  schema: z.ZodType<R, unknown>,
  answer: (connector: FakeConnector, state: ConnectorsState, request: R) => Answer,
): RequestHandler {
  return async (request, response) => {
    const body = schema.safeParse(request.body);
    if (!body.success) return refuse(context, response, call, z.prettifyError(body.error));
    const connector = findConnector(body.data.connector);
    if (connector === undefined)
      return refuse(context, response, call, "No connector has this key");
    if (!connector.description.runtimes.includes(body.data.runtime.kind)) {
      return refuse(context, response, call, "The connector does not list this runtime");
    }
    await sleep(context.state.delayMs);
    const result = checkedAnswer(context.state, call, connector, body.data, answer);
    context.log(
      JSON.stringify({
        connector: connector.key,
        call,
        ...actionOf(body.data),
        outcome: outcomeOf(result),
      }),
    );
    response.json(result);
  };
}

/** A planned failure first, then the checks a real connector makes before it answers. */
function checkedAnswer<R extends CallRequest>(
  state: ConnectorsState,
  call: ConnectorCall,
  connector: FakeConnector,
  request: R,
  answer: (connector: FakeConnector, state: ConnectorsState, request: R) => Answer,
): Answer {
  const failure = takePlannedFailure(state, connector, call);
  if (failure !== undefined) return errorAnswer(failure);
  if (!connector.authenticates(state, request.connection.secrets)) {
    return errorAnswer("authentication_failed");
  }
  if (
    call !== "connections/test" &&
    reachesOtherWorkspace(connector, request.connection.settings)
  ) {
    return errorAnswer("wrong_workspace");
  }
  return answer(connector, state, request);
}

function testConnection(connector: FakeConnector): ConnectionTestAnswer {
  return {
    details: { organizationName: connector.workspace.name, domain: null },
    connection: { settings: connector.workspace.settings },
  };
}

function listAccounts(
  connector: FakeConnector,
  state: ConnectorsState,
  request: ListRequest,
): AccountsListAnswer {
  const members = membersOf(state, connector.key);
  const offset = request.cursor ?? 0;
  const next = offset + PAGE_SIZE;
  return {
    accounts: members.slice(offset, next).map((member) => ({
      sourceKey: member.sourceKey,
      raw: connector.raw(member),
      values: valuesOf(member),
    })),
    nextCursor: next < members.length ? Buffer.from(String(next)).toString("base64url") : null,
  };
}

/** Changes exactly one matching member; the answer reads it from memory after the change. */
function runAction(
  connector: FakeConnector,
  state: ConnectorsState,
  request: ActionRunRequest,
): ActionRunAnswer | ConnectorErrorAnswer {
  const { sourceKey, email } = request.account;
  const matches = membersOf(state, connector.key).filter(
    (member) => member.sourceKey === sourceKey && member.email === email,
  );
  const [member] = matches;
  if (member === undefined || matches.length > 1) return errorAnswer("account_not_found");
  const status = request.action === "suspend" ? "suspended" : "active";
  const changed = member.status !== status;
  member.status = status;
  return { changed, account: { sourceKey, values: valuesOf(member) } };
}

function takePlannedFailure(
  state: ConnectorsState,
  connector: FakeConnector,
  call: ConnectorCall,
): ConnectorErrorCode | undefined {
  const key = `${connector.key} ${call}` as const;
  const failure = state.failures.get(key);
  if (failure === undefined) return undefined;
  failure.remaining -= 1;
  if (failure.remaining === 0) state.failures.delete(key);
  return failure.code;
}

/** Settings from an earlier test that name another workspace than the one the secrets reach. */
function reachesOtherWorkspace(
  connector: FakeConnector,
  settings: Record<string, unknown>,
): boolean {
  const id = settings[connector.workspaceIdSetting];
  return id !== undefined && id !== connector.workspace.settings[connector.workspaceIdSetting];
}

function valuesOf(member: SeedMember): AccountValues {
  return {
    email: member.email,
    status: member.status === "suspended" ? "suspended" : "active",
    displayName: member.displayName,
    isConnectionUser: member.isConnectionUser,
  };
}

function errorAnswer(code: ConnectorErrorCode): ConnectorErrorAnswer {
  return { error: { code } };
}

function actionOf(request: CallRequest): { action?: string } {
  return "action" in request ? { action: request.action } : {};
}

function outcomeOf(answer: Answer): string {
  return "error" in answer ? answer.error.code : "ok";
}

/** Logs only the call: the body may carry secrets and emails. */
function refuse(
  context: FakeConnectorsContext,
  response: Response,
  call: ConnectorCall,
  message: string,
): void {
  context.log(JSON.stringify({ call, outcome: "refused" }));
  response.status(400).json({ error: message });
}
