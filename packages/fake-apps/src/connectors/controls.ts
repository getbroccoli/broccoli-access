import { CONNECTOR_CALLS, CONNECTOR_ERROR_CODES } from "@broccoli-access/connector-contract";
import express, { Router, type RequestHandler } from "express";
import { z } from "zod";

import { invalidBody, notFound, refuseBrowsers } from "../utils";
import type { FakeConnectorsContext, FakeConnectorKey } from "./connectorsState";
import type { FakeConnector } from "./fakeConnector";
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
      });
    })
    .post("/_fake/:connector/members/:email/suspend", setStatus(context, "suspended"))
    .post("/_fake/:connector/members/:email/reactivate", setStatus(context, "active"))
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

const PLANNED_FAILURE = z.object({
  connector: CONNECTOR_KEY,
  call: z.enum(CONNECTOR_CALLS),
  code: z.enum(CONNECTOR_ERROR_CODES),
  count: z.int().positive(),
});

/** Node fires a longer timer at once, so the delay stops at its largest timer. */
const MAX_DELAY_MS = 2 ** 31 - 1;

const DELAY = z.object({ milliseconds: z.int().min(0).max(MAX_DELAY_MS) });

const INVITATION = z.object({ email: z.email().transform((email) => email.toLowerCase()) });

function memberStates(context: FakeConnectorsContext, connector: FakeConnectorKey) {
  return context.state.members[connector].map(({ sourceKey, email, displayName, status }) => ({
    sourceKey,
    email,
    displayName,
    status,
  }));
}

function setStatus(
  context: FakeConnectorsContext,
  status: "active" | "suspended",
): RequestHandler<{ connector: string; email: string }> {
  return (request, response) => {
    const connector = CONNECTOR_KEY.safeParse(request.params.connector);
    if (!connector.success) return notFound(response, "No connector has this key");
    const email = request.params.email.toLowerCase();
    const member = context.state.members[connector.data].find((each) => each.email === email);
    if (member === undefined) return notFound(response, "No member has this email");
    member.status = status;
    response.sendStatus(204);
  };
}

/** An invitation sent in the app itself, as an invite would send it. */
function sendInvitation(context: FakeConnectorsContext): RequestHandler<{ connector: string }> {
  return (request, response) => {
    const connector = findConnector(request.params.connector);
    if (connector === undefined) return notFound(response, "No connector has this key");
    const body = INVITATION.safeParse(request.body);
    if (!body.success) return invalidBody(response, body.error);
    invite(connector, context.state, body.data.email);
    response.sendStatus(204);
  };
}

function changeInvitation(
  context: FakeConnectorsContext,
  change: (
    connector: FakeConnector,
    state: FakeConnectorsContext["state"],
    email: string,
  ) => boolean,
): RequestHandler<{ connector: string; email: string }> {
  return (request, response) => {
    const connector = findConnector(request.params.connector);
    if (connector === undefined) return notFound(response, "No connector has this key");
    if (!change(connector, context.state, request.params.email.toLowerCase())) {
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
    context.state.failures.set(`${connector} ${call}`, { code, remaining: count });
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
