import type { Request, RequestHandler } from "express";
import { z } from "zod";

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

export interface PageRequest {
  maxResults: number;
  /** How many items earlier pages held; the page token carries it. */
  offset: number;
}

/** The page a list call asks for, within the method's bounds; undefined when Google refuses it. */
export function parsePageRequest(query: unknown, method: AdminMethod): PageRequest | undefined {
  const bounds = adminMethodRules(method).maxResults;
  if (bounds === undefined) throw new Error(`${method} is not a list method`);
  const parsed = z
    .object({
      maxResults: z.coerce.number().int().min(bounds.minimum).max(bounds.maximum).optional(),
      pageToken: z.string().optional(),
    })
    .safeParse(query);
  if (!parsed.success) return undefined;
  const offset = parsed.data.pageToken === undefined ? 0 : pageTokenOffset(parsed.data.pageToken);
  if (offset === undefined) return undefined;
  return { maxResults: parsed.data.maxResults ?? bounds.default, offset };
}

/** One page of `items`, with an opaque token to the next while more remain. */
export function pageOf<T>(items: T[], { maxResults, offset }: PageRequest) {
  const end = offset + maxResults;
  const nextPageToken =
    end < items.length ? Buffer.from(`o${end}`).toString("base64url") : undefined;
  return { items: items.slice(offset, end), nextPageToken };
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

function pageTokenOffset(pageToken: string): number | undefined {
  const match = /^o(\d+)$/.exec(Buffer.from(pageToken, "base64url").toString());
  return match?.[1] === undefined ? undefined : Number(match[1]);
}
