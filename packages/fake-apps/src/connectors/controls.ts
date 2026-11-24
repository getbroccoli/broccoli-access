import { CONNECTOR_CALLS, CONNECTOR_ERROR_CODES } from "@broccoli-access/connector-contract";
import express, { Router, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";

import type { SeedMember } from "../seed";
import { invalidBody, notFound, refuseBrowsers } from "../utils";
import {
  failureKeyOf,
  type ConnectorsState,
  type FakeConnectorsContext,
  type FakeConnectorKey,
} from "./connectorsState";
import { listsRole, type FakeConnector } from "./fakeConnector";
import { findConnector } from "./fakeConnectorList";
import { acceptInvitation, invite, removeInvitation } from "./invitations";

/**
 * Endpoints only the fake has (docs/fake-apps.md, "Fake connectors container"), so tests and
 * agents can change members as an admin would and make calls fail. They have no authentication,
 * so the fake listens only where tests and the app reach it.
 */
export function controlRoutes(context: FakeConnectorsContext): Router {
  return Router()
    .use("/_fake", refuseBrowsers, express.json())
    .post("/_fake/reset", (_request, response) => {
      context.reset();
      response.sendStatus(204);
    })
    .get("/_fake/state", (_request, response) => {
      response.json({
        slack: memberStates(context, "slack"),
        linear: memberStates(context, "linear"),
        invitations: context.state.invitations,
        changes: context.state.changes,
      });
    })
    .post("/_fake/:connector/members/:email/suspend", setStatus(context, "suspended"))
    .post("/_fake/:connector/members/:email/reactivate", setStatus(context, "active"))
    .post("/_fake/:connector/members/:email/remove", removeMember(context))
    .post("/_fake/:connector/members/:email/role", setRole(context))
    .post("/_fake/:connector/invitations", sendInvitation(context))
    .post(
      "/_fake/:connector/invitations/:email/accept",
      changeInvitation(context, acceptInvitation),
    )
    .post(
      "/_fake/:connector/invitations/:email/expire",
      changeInvitation(context, removeInvitation),
    )
    .post("/_fake/failures", planFailure(context))
    .post("/_fake/slack/sessions/expire", (_request, response) => {
      context.state.slackSessions.clear();
      response.sendStatus(204);
    })
    .post("/_fake/linear/keys/revoke", (_request, response) => {
      context.state.linearKeyRevoked = true;
      response.sendStatus(204);
    })
    .post("/_fake/delay", setDelay(context));
}

const CONNECTOR_KEY = z.enum(["slack", "linear"]);

const FAILURE = { code: z.enum(CONNECTOR_ERROR_CODES), count: z.int().positive() };

/** `integration-user/setup` carries no connector, so its failure names none. */
const PLANNED_FAILURE = z.union([
  z.object({
    connector: CONNECTOR_KEY,
    call: z.enum([...CONNECTOR_CALLS, "connections/sign-in"]),
    ...FAILURE,
  }),
  z.object({
    connector: z.undefined().optional(),
    call: z.literal("integration-user/setup"),
    ...FAILURE,
  }),
]);

/** Node fires a longer timer at once, so the delay stops at its largest timer. */
const MAX_DELAY_MS = 2 ** 31 - 1;

const DELAY = z.object({ milliseconds: z.int().min(0).max(MAX_DELAY_MS) });

const INVITATION = z.object({ email: z.email().transform((email) => email.toLowerCase()) });

const ROLE = z.object({ role: z.string() });

type MemberRequest = Request<{ connector: string; email: string }>;

function memberStates(context: FakeConnectorsContext, connector: FakeConnectorKey) {
  return context.state.members[connector].map(
    ({ sourceKey, email, displayName, status, role }) => ({
      sourceKey,
      email,
      displayName,
      status,
      role,
    }),
  );
}

function setStatus(
  context: FakeConnectorsContext,
  status: "active" | "suspended",
): RequestHandler<MemberRequest["params"]> {
  return (request, response) => {
    const found = findMember(context, request, response);
    if (found === undefined) return;
    found.member.status = status;
    response.sendStatus(204);
  };
}

function removeMember(context: FakeConnectorsContext): RequestHandler<MemberRequest["params"]> {
  return (request, response) => {
    const found = findMember(context, request, response);
    if (found === undefined) return;
    found.members.splice(found.members.indexOf(found.member), 1);
    response.sendStatus(204);
  };
}

function setRole(context: FakeConnectorsContext): RequestHandler<MemberRequest["params"]> {
  return (request, response) => {
    const found = findMember(context, request, response);
    if (found === undefined) return;
    const body = ROLE.safeParse(request.body);
    if (!body.success) return invalidBody(response, body.error);
    if (!listsRole(found.connector, body.data.role)) {
      response.status(400).json({ error: "The connector does not list this role" });
      return;
    }
    found.member.role = body.data.role;
    response.sendStatus(204);
  };
}

/** The member the path names, among its workspace's; answers 404 and finds nothing without one. */
function findMember(
  context: FakeConnectorsContext,
  request: MemberRequest,
  response: Response,
): { connector: FakeConnector; members: SeedMember[]; member: SeedMember } | undefined {
  const connector = findConnector(request.params.connector);
  if (connector === undefined) {
    notFound(response, "No connector has this key");
    return undefined;
  }
  const members = context.state.members[connector.description.key];
  const email = request.params.email.toLowerCase();
  const member = members.find((each) => each.email === email);
  if (member === undefined) {
    notFound(response, "No member has this email");
    return undefined;
  }
  return { connector, members, member };
}

/** An invitation sent in the app itself, as an invite without a role would send it. */
function sendInvitation(context: FakeConnectorsContext): RequestHandler<{ connector: string }> {
  return (request, response) => {
    const connector = findConnector(request.params.connector);
    if (connector === undefined) return notFound(response, "No connector has this key");
    const body = INVITATION.safeParse(request.body);
    if (!body.success) return invalidBody(response, body.error);
    invite(connector, context.state, body.data);
    response.sendStatus(204);
  };
}

function changeInvitation(
  context: FakeConnectorsContext,
  change: (connector: FakeConnector, state: ConnectorsState, email: string) => unknown,
): RequestHandler<{ connector: string; email: string }> {
  return (request, response) => {
    const connector = findConnector(request.params.connector);
    if (connector === undefined) return notFound(response, "No connector has this key");
    if (change(connector, context.state, request.params.email.toLowerCase()) === undefined) {
      return notFound(response, "No invitation has this email");
    }
    response.sendStatus(204);
  };
}

function planFailure(context: FakeConnectorsContext): RequestHandler {
  return (request, response) => {
    const body = PLANNED_FAILURE.safeParse(request.body);
    if (!body.success) return invalidBody(response, body.error);
    const { connector, call, code, count } = body.data;
    context.state.failures.set(failureKeyOf(call, connector), { code, remaining: count });
    response.sendStatus(204);
  };
}

function setDelay(context: FakeConnectorsContext): RequestHandler {
  return (request, response) => {
    const body = DELAY.safeParse(request.body);
    if (!body.success) return invalidBody(response, body.error);
    context.state.delayMs = body.data.milliseconds;
    response.sendStatus(204);
  };
}
