import {
  ACCOUNTS_LIST_REQUEST,
  ACTION_RUN_REQUEST,
  CONNECTION_TEST_REQUEST,
  type AccountsListAnswer,
  type ActionRunRequest,
  type ConnectionTestAnswer,
  type ConnectionTestRequest,
  type ConnectorCall,
} from "@broccoli-access/connector-contract";
import express, { Router } from "express";
import { z } from "zod";

import { pageOf, pageTokenOffset } from "../utils";
import { valuesOf, type ActingConnection } from "./actingConnection";
import { answerCall, errorAnswer, type CallAnswer, type CallPlan } from "./answerCall";
import type { ConnectorsState, FakeConnectorsContext } from "./connectorsState";
import { detailsOf, listsRole, reachesOtherWorkspace, type FakeConnector } from "./fakeConnector";
import { FAKE_CONNECTORS, findConnector } from "./fakeConnectorList";
import { integrationUserCallRoutes } from "./integrationUserCalls";
import { withoutRole } from "./invitations";
import { runAction } from "./runAction";

/** The connector contract's calls, answered from the fake's memory (docs/connector-contract.md). */
export function connectorCallRoutes(context: FakeConnectorsContext): Router {
  const answer = <R extends CallRequest>(
    call: ConnectorCall,
    schema: z.ZodType<R, unknown>,
    answerAs: AnswerAs<R>,
  ) => answerCall(context, call, schema, (request) => planOf(call, request, answerAs));
  return Router()
    .get("/v1/connectors", (_request, response) => {
      response.json({ connectors: FAKE_CONNECTORS.map(({ description }) => description) });
    })
    .use("/v1", express.json())
    .post(
      "/v1/connections/test",
      answer("connections/test", CONNECTION_TEST_REQUEST, testConnection),
    )
    .post("/v1/accounts/list", answer("accounts/list", LIST_REQUEST, listAccounts))
    .post("/v1/actions/run", answer("actions/run", ACTION_RUN_REQUEST, runAction))
    .use(integrationUserCallRoutes(context));
}

/** Small enough that Acme's 44 Slack members take three pages, so callers page for real. */
const PAGE_SIZE = 20;

/** An opaque cursor from an earlier page; any other text is refused with HTTP 400. */
const PAGE_CURSOR = z.string().transform((cursor, context) => {
  const offset = pageTokenOffset(cursor);
  if (offset === undefined) context.addIssue({ code: "custom", message: "Unknown cursor" });
  return offset ?? 0;
});

const LIST_REQUEST = ACCOUNTS_LIST_REQUEST.extend({ cursor: PAGE_CURSOR.nullable() });

type ListRequest = z.infer<typeof LIST_REQUEST>;

type CallRequest = ConnectionTestRequest | ListRequest | ActionRunRequest;

/** Answers a call as the app would, through a connection that reaches the workspace. */
type AnswerAs<R> = (connection: ActingConnection, request: R) => CallAnswer;

/** Refuses a connector, runtime or role the manifest does not list. */
function planOf<R extends CallRequest>(
  call: ConnectorCall,
  request: R,
  answerAs: AnswerAs<R>,
): CallPlan {
  const connector = findConnector(request.connector);
  if (connector === undefined) return { refused: "No connector has this key" };
  if (!connector.description.runtimes.includes(request.runtime.kind)) {
    return { refused: "The connector does not list this runtime" };
  }
  if (invitesWithUnlistedRole(connector, request)) {
    return { refused: "The connector does not list this role" };
  }
  return {
    connector: connector.description.key,
    ...("action" in request ? { action: request.action } : {}),
    answer: (state) => checkedAnswer(call, { connector, state }, request, answerAs),
  };
}

function invitesWithUnlistedRole(connector: FakeConnector, request: CallRequest): boolean {
  if (!("action" in request) || request.action !== "invite") return false;
  const { role } = request.account;
  return role !== undefined && !listsRole(connector, role);
}

/** The checks a real connector makes before it answers. */
function checkedAnswer<R extends CallRequest>(
  call: ConnectorCall,
  { connector, state }: { connector: FakeConnector; state: ConnectorsState },
  request: R,
  answerAs: AnswerAs<R>,
): CallAnswer {
  const actor = connector.connectionMember(state, request.connection.secrets);
  if (actor === undefined) return errorAnswer("authentication_failed");
  if (
    call !== "connections/test" &&
    reachesOtherWorkspace(connector, request.connection.settings)
  ) {
    return errorAnswer("wrong_workspace");
  }
  return answerAs({ connector, state, actor }, request);
}

function testConnection({ connector }: ActingConnection): ConnectionTestAnswer {
  return { details: detailsOf(connector), connection: { settings: connector.workspace.settings } };
}

function listAccounts(
  { connector, state, actor }: ActingConnection,
  request: ListRequest,
): AccountsListAnswer {
  const { key } = connector.description;
  const page = pageOf(state.members[key], { maxResults: PAGE_SIZE, offset: request.cursor ?? 0 });
  return {
    accounts: page.items.map((member) => ({
      sourceKey: member.sourceKey,
      raw: connector.raw(member),
      values: valuesOf(member, actor),
    })),
    // Every pending invitation fits on the first page.
    ...(request.cursor === null ? { invitations: state.invitations[key].map(withoutRole) } : {}),
    nextCursor: page.nextPageToken ?? null,
  };
}
