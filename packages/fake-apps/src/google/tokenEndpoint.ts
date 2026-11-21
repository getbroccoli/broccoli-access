import { randomBytes } from "node:crypto";

import type { Request, RequestHandler, Response } from "express";
import { SignJWT } from "jose";
import { z } from "zod";

import type { FakeGoogleContext } from "./context";
import {
  findPerson,
  fullName,
  type GoogleState,
  type OAuthClient,
  type TokenHolder,
} from "./state";

/** The issuer Google's ID tokens carry, which sign-in code checks; the fake signs as Google. */
export const GOOGLE_ISSUER = "https://accounts.google.com";

/** Google's token endpoint: authorization codes and refresh tokens become access tokens. */
export function exchangeToken(context: FakeGoogleContext): RequestHandler {
  return async (request, response) => {
    const client = authenticateClient(context.state, request);
    if (client === undefined) return refuse(response, 401, { error: "invalid_client" });
    const body = TOKEN_REQUEST.safeParse(request.body);
    if (!body.success) return refuse(response, 400, { error: "invalid_request" });
    switch (body.data.grant_type) {
      case "authorization_code":
        return exchangeCode(context, client, body.data, response);
      case "refresh_token":
        return refreshAccessToken(context, client, body.data, response);
      default:
        return refuse(response, 400, {
          error: "unsupported_grant_type",
          error_description: `Invalid grant_type: ${body.data.grant_type}`,
        });
    }
  };
}

const TOKEN_REQUEST = z.object({
  grant_type: z.string(),
  code: z.string().optional(),
  redirect_uri: z.string().optional(),
  refresh_token: z.string().optional(),
});

type TokenRequest = z.infer<typeof TOKEN_REQUEST>;

/** As long as Google's access tokens live. */
const ACCESS_TOKEN_SECONDS = 3599;

/** As long as Google's ID tokens live. */
const ID_TOKEN_SECONDS = 3600;

const CODE_REFUSED = { error: "invalid_grant", error_description: "Bad Request" };

const REFRESH_TOKEN_REFUSED = {
  error: "invalid_grant",
  error_description: "Token has been expired or revoked.",
};

async function exchangeCode(
  context: FakeGoogleContext,
  client: OAuthClient,
  { code = "", redirect_uri }: TokenRequest,
  response: Response,
): Promise<void> {
  const { state } = context;
  const authorization = state.authorizationCodes.get(code);
  if (authorization === undefined || authorization.clientId !== client.clientId) {
    return refuse(response, 400, CODE_REFUSED);
  }
  state.authorizationCodes.delete(code);
  if (redirect_uri !== authorization.redirectUri) {
    return refuse(response, 400, {
      error: "redirect_uri_mismatch",
      error_description: "Bad Request",
    });
  }
  const refreshToken = authorization.issuesRefreshToken
    ? issueRefreshToken(state, authorization)
    : undefined;
  const idToken = authorization.scopes.includes("openid")
    ? await signIdToken(context, authorization, authorization.nonce)
    : undefined;
  response.json({
    ...accessTokenResponse(context, authorization),
    ...(refreshToken !== undefined && { refresh_token: refreshToken }),
    ...(idToken !== undefined && { id_token: idToken }),
  });
}

function refreshAccessToken(
  context: FakeGoogleContext,
  client: OAuthClient,
  { refresh_token = "" }: TokenRequest,
  response: Response,
): void {
  const holder = context.state.refreshTokens.get(refresh_token);
  if (holder === undefined || holder.clientId !== client.clientId) {
    return refuse(response, 400, REFRESH_TOKEN_REFUSED);
  }
  response.json(accessTokenResponse(context, holder));
}

/** The client from HTTP Basic or the form's `client_id` and `client_secret`, if they match. */
function authenticateClient(state: GoogleState, request: Request): OAuthClient | undefined {
  const { clientId, clientSecret } = clientCredentials(request);
  const client = state.clients.find((candidate) => candidate.clientId === clientId);
  return client?.clientSecret === clientSecret ? client : undefined;
}

function clientCredentials(request: Request): { clientId?: string; clientSecret?: string } {
  const basic = /^Basic (\S+)$/i.exec(request.get("authorization") ?? "")?.[1];
  if (basic !== undefined) {
    const [clientId = "", clientSecret = ""] = Buffer.from(basic, "base64").toString().split(":");
    return {
      clientId: formDecoded(clientId),
      clientSecret: formDecoded(clientSecret),
    };
  }
  const form = (request.body ?? {}) as Record<string, unknown>;
  return {
    clientId: typeof form.client_id === "string" ? form.client_id : undefined,
    clientSecret: typeof form.client_secret === "string" ? form.client_secret : undefined,
  };
}

/** RFC 6749 form-encodes Basic credentials; a malformed one decodes to text that matches no client. */
function formDecoded(value: string): string {
  return new URLSearchParams(`value=${value}`).get("value") ?? "";
}

function accessTokenResponse(context: FakeGoogleContext, holder: TokenHolder) {
  const accessToken = `ya29.${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(context.now().getTime() + ACCESS_TOKEN_SECONDS * 1000);
  context.state.accessTokens.set(accessToken, { ...holder, expiresAt });
  return {
    access_token: accessToken,
    expires_in: ACCESS_TOKEN_SECONDS,
    scope: holder.scopes.join(" "),
    token_type: "Bearer",
  };
}

function issueRefreshToken(state: GoogleState, holder: TokenHolder): string {
  const refreshToken = `1//${randomBytes(32).toString("base64url")}`;
  state.refreshTokens.set(refreshToken, {
    email: holder.email,
    clientId: holder.clientId,
    scopes: holder.scopes,
  });
  return refreshToken;
}

async function signIdToken(
  context: FakeGoogleContext,
  { email, clientId }: TokenHolder,
  nonce: string | undefined,
): Promise<string> {
  const person = findPerson(context.state, email);
  if (person === undefined) throw new Error("An authorization code names a person the fake lost");
  const issuedAt = Math.floor(context.now().getTime() / 1000);
  return new SignJWT({
    email: person.email,
    email_verified: true,
    hd: context.state.customer.domain,
    name: fullName(person),
    given_name: person.givenName,
    family_name: person.familyName,
    ...(nonce !== undefined && { nonce }),
  })
    .setProtectedHeader({ alg: "RS256", kid: context.signingKey.kid, typ: "JWT" })
    .setIssuer(GOOGLE_ISSUER)
    .setAudience(clientId)
    .setSubject(person.id)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ID_TOKEN_SECONDS)
    .sign(context.signingKey.privateKey);
}

function refuse(response: Response, status: number, body: Record<string, string>): void {
  response.status(status).json(body);
}
