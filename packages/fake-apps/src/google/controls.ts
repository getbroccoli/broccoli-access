import express, { Router, type RequestHandler } from "express";
import { z } from "zod";

import { invalidBody, notFound, refuseBrowsers } from "../utils";
import { ADMIN_METHODS } from "./adminMethods";
import type { FakeGoogleContext } from "./context";
import { CONNECTOR_ERRORS } from "./googleErrors";
import { findPerson, grantAccess, revokeGrant } from "./state";

/**
 * Endpoints only the fake has, so tests and agents can change its data mid-run and make calls
 * fail. They have no authentication, so the fake listens only where tests and the app reach it.
 */
export function controlRoutes(context: FakeGoogleContext): Router {
  return Router()
    .use("/_fake", refuseBrowsers, express.json())
    .post("/_fake/reset", (_request, response) => {
      context.reset();
      response.sendStatus(204);
    })
    .get("/_fake/state", (_request, response) => {
      const { people, grants, events } = context.state;
      response.json({
        people: people.length,
        suspendedPeople: people.filter((person) => person.suspended).length,
        apps: new Set(grants.map((grant) => grant.clientId)).size,
        grants: grants.length,
        events: events.length,
      });
    })
    .post("/_fake/users/:email/suspend", setSuspended(context, true))
    .post("/_fake/users/:email/unsuspend", setSuspended(context, false))
    .post("/_fake/grants", addGrant(context))
    .delete("/_fake/grants", deleteGrant(context))
    .post("/_fake/failures", planFailures(context))
    .post("/_fake/tokens/expire", (_request, response) => {
      context.state.accessTokens.clear();
      response.sendStatus(204);
    })
    .post("/_fake/tokens/revoke", (_request, response) => {
      context.state.refreshTokens.clear();
      response.sendStatus(204);
    })
    .post("/_fake/clients", registerClient(context));
}

const NEW_GRANT = z.object({
  email: z.string(),
  clientId: z.string().min(1),
  appName: z.string().min(1),
  grantedAt: z.iso.datetime({ offset: true }).optional(),
});

const GRANT_KEY = z.object({ email: z.string(), clientId: z.string() });

const PLANNED_FAILURE = z.object({
  endpoint: z.enum(ADMIN_METHODS),
  error: z.enum(CONNECTOR_ERRORS),
  count: z.number().int().positive(),
});

const NEW_CLIENT = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUris: z.array(z.url()).min(1),
});

/** The default scopes of a grant added by hand: what an app asks for to sign people in. */
const SIGN_IN_SCOPES = ["openid", "email", "profile"];

function setSuspended(
  context: FakeGoogleContext,
  suspended: boolean,
): RequestHandler<{ email: string }> {
  return (request, response) => {
    const person = findPerson(context.state, request.params.email);
    if (person === undefined) return notFound(response, "No person has this email");
    person.suspended = suspended;
    response.sendStatus(204);
  };
}

function addGrant(context: FakeGoogleContext): RequestHandler {
  return (request, response) => {
    const body = NEW_GRANT.safeParse(request.body);
    if (!body.success) return invalidBody(response, body.error);
    const { email, clientId, appName, grantedAt } = body.data;
    const person = findPerson(context.state, email);
    if (person === undefined) return notFound(response, "No person has this email");
    const now = context.now();
    grantAccess(
      context.state,
      {
        email: person.email,
        clientId,
        appName,
        scopes: SIGN_IN_SCOPES,
        grantedAt: grantedAt === undefined ? now : new Date(grantedAt),
      },
      now,
    );
    response.sendStatus(204);
  };
}

function deleteGrant(context: FakeGoogleContext): RequestHandler {
  return (request, response) => {
    const body = GRANT_KEY.safeParse(request.body);
    if (!body.success) return invalidBody(response, body.error);
    const email = findPerson(context.state, body.data.email)?.email ?? body.data.email;
    if (!revokeGrant(context.state, email, body.data.clientId)) {
      return notFound(response, "This person has no grant for this client");
    }
    response.sendStatus(204);
  };
}

function planFailures(context: FakeGoogleContext): RequestHandler {
  return (request, response) => {
    const body = PLANNED_FAILURE.safeParse(request.body);
    if (!body.success) return invalidBody(response, body.error);
    const { endpoint, error, count } = body.data;
    context.state.failures.set(endpoint, { error, remaining: count });
    response.sendStatus(204);
  };
}

function registerClient(context: FakeGoogleContext): RequestHandler {
  return (request, response) => {
    const body = NEW_CLIENT.safeParse(request.body);
    if (!body.success) return invalidBody(response, body.error);
    const { clientId } = body.data;
    const others = context.state.clients.filter((client) => client.clientId !== clientId);
    // The design gives a registered client no name, so its ID is what people see.
    context.state.clients = [...others, { ...body.data, name: clientId }];
    response.sendStatus(204);
  };
}
