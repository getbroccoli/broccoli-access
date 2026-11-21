import type { Request, RequestHandler } from "express";

import { adminMethodRules, type AdminMethod } from "./adminMethods";
import type { FakeGoogleContext } from "./context";
import { sendConnectorFailure, sendGoogleError } from "./googleErrors";
import { findPerson, type AccessToken, type GoogleState } from "./state";

/**
 * Checks a call to an Admin API method as Google does, in Google's order: a planned failure
 * first, then the access token, its scopes, and whether its account is a super admin.
 */
export function adminAccess(context: FakeGoogleContext, method: AdminMethod): RequestHandler {
  const { scopes } = adminMethodRules(method);
  return (request, response, next) => {
    const failure = takePlannedFailure(context.state, method);
    if (failure !== undefined) return sendConnectorFailure(response, failure);
    const token = validAccessToken(context, request);
    if (token === undefined) return sendGoogleError(response, "unauthenticated");
    if (!token.scopes.some((scope) => scopes.includes(scope))) {
      return sendGoogleError(response, "insufficientPermissions");
    }
    if (!isActiveSuperAdmin(context.state, token.email)) {
      return sendGoogleError(response, "forbidden");
    }
    next();
  };
}

/** The request's bearer access token, unless it is unknown or expired. */
export function validAccessToken(
  context: FakeGoogleContext,
  request: Request,
): AccessToken | undefined {
  const bearer = /^Bearer (\S+)$/i.exec(request.get("authorization") ?? "")?.[1];
  const token = bearer === undefined ? undefined : context.state.accessTokens.get(bearer);
  return token !== undefined && token.expiresAt > context.now() ? token : undefined;
}

function takePlannedFailure(state: GoogleState, method: AdminMethod) {
  const failure = state.failures.get(method);
  if (failure === undefined) return undefined;
  failure.remaining -= 1;
  if (failure.remaining === 0) state.failures.delete(method);
  return failure.error;
}

function isActiveSuperAdmin(state: GoogleState, email: string): boolean {
  const person = findPerson(state, email);
  return person !== undefined && person.isSuperAdmin && !person.suspended;
}
