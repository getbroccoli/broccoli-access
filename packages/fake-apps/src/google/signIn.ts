import { randomBytes } from "node:crypto";

import express, { Router, type RequestHandler, type Response } from "express";
import { z } from "zod";

import { validAccessToken } from "./adminAccess";
import { authorizationErrorHtml, consentPageHtml } from "./consentPage";
import type { FakeGoogleContext } from "./context";
import { sendGoogleError } from "./googleErrors";
import {
  findGrant,
  findPerson,
  fullName,
  grantAccess,
  type GoogleState,
  type OAuthClient,
} from "./state";
import { exchangeToken, GOOGLE_ISSUER } from "./tokenEndpoint";

/** Google's OAuth 2.0 and OpenID Connect endpoints, as Google runs them for a web application. */
export function signInRoutes(context: FakeGoogleContext): Router {
  const form = express.urlencoded({ extended: false });
  return Router()
    .get("/.well-known/openid-configuration", (_request, response) => {
      response.json(openIdConfiguration(context));
    })
    .get(JWKS_PATH, (_request, response) => {
      const { kid, publicJwk } = context.signingKey;
      response.json({ keys: [{ ...publicJwk, kid, alg: "RS256", use: "sig" }] });
    })
    .get(AUTHORIZATION_PATH, showConsentPage(context))
    .post(AUTHORIZATION_PATH, form, decideConsent(context))
    .post(TOKEN_PATH, form, exchangeToken(context))
    .get(USERINFO_PATH, showUserInfo(context));
}

const AUTHORIZATION_PATH = "/o/oauth2/v2/auth";
const TOKEN_PATH = "/token";
const USERINFO_PATH = "/v1/userinfo";
const JWKS_PATH = "/oauth2/v3/certs";

/** The discovery document; each list is a subset of Google's, holding only what the fake supports. */
function openIdConfiguration({ browserUrl, serverUrl }: FakeGoogleContext) {
  return {
    issuer: GOOGLE_ISSUER,
    authorization_endpoint: `${browserUrl}${AUTHORIZATION_PATH}`,
    token_endpoint: `${serverUrl}${TOKEN_PATH}`,
    userinfo_endpoint: `${serverUrl}${USERINFO_PATH}`,
    jwks_uri: `${serverUrl}${JWKS_PATH}`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    scopes_supported: ["openid", "email", "profile"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
    claims_supported: [
      "aud",
      "email",
      "email_verified",
      "exp",
      "family_name",
      "given_name",
      "iat",
      "iss",
      "name",
      "sub",
    ],
    grant_types_supported: ["authorization_code", "refresh_token"],
  };
}

const AUTHORIZATION_REQUEST = z.object({
  client_id: z.string(),
  redirect_uri: z.string(),
  response_type: z.literal("code"),
  scope: z.string().trim().min(1),
  state: z.string().optional(),
  access_type: z.string().optional(),
  prompt: z.string().optional(),
  include_granted_scopes: z.string().optional(),
  nonce: z.string().optional(),
});

type AuthorizationRequest = z.infer<typeof AUTHORIZATION_REQUEST>;

/** Read on its own first, because a bad client or redirect address gets an error page, never a redirect. */
const REDIRECT_TARGET = z.object({
  client_id: z.string().catch(""),
  redirect_uri: z.string().catch(""),
});

const CONSENT_DECISION = z.object({
  decision: z.enum(["allow", "cancel"]),
  account: z.string().optional(),
});

function showConsentPage(context: FakeGoogleContext): RequestHandler {
  return (request, response) => {
    const authorization = checkAuthorization(context.state, request.query, response);
    if (authorization === undefined) return;
    const { client, parameters } = authorization;
    response.type("html").send(
      consentPageHtml({
        appName: client.name,
        scopes: scopesToAllow(parameters),
        accounts: context.state.people.filter((person) => !person.suspended),
        parameters,
      }),
    );
  };
}

/**
 * The permissions the page lists: with `include_granted_scopes`, the API permissions asked for and
 * never the sign-in scopes, as Google's incremental consent does.
 */
function scopesToAllow(parameters: AuthorizationRequest): string[] {
  const asked = parameters.scope.split(" ");
  if (parameters.include_granted_scopes !== "true") return asked;
  return asked.filter((scope) => !SIGN_IN_SCOPES.includes(scope));
}

const SIGN_IN_SCOPES = ["openid", "email", "profile"];

function decideConsent(context: FakeGoogleContext): RequestHandler {
  return (request, response) => {
    const authorization = checkAuthorization(context.state, request.body, response);
    if (authorization === undefined) return;
    const decision = CONSENT_DECISION.safeParse(request.body);
    if (!decision.success) return refuseAuthorization(response, 400, "invalid_request");
    const { client, parameters } = authorization;
    if (decision.data.decision === "cancel") {
      return redirectBack(response, parameters, { error: "access_denied" });
    }
    const person = findPerson(context.state, decision.data.account ?? "");
    if (person === undefined || person.suspended) {
      return refuseAuthorization(response, 400, "invalid_request");
    }
    const code = authorize(context, client, parameters, person.email);
    redirectBack(response, parameters, { code });
  };
}

/** Records the consent when it is a new one, and issues the authorization code. */
function authorize(
  context: FakeGoogleContext,
  client: OAuthClient,
  parameters: AuthorizationRequest,
  email: string,
): string {
  const { state } = context;
  const refused = state.refusedScope;
  state.refusedScope = null;
  const scopes = parameters.scope.split(" ").filter((scope) => scope !== refused);
  const earlier = findGrant(state, email, client.clientId);
  const consentsNow =
    !scopes.every((scope) => earlier?.scopes.includes(scope)) ||
    (parameters.prompt ?? "").split(" ").includes("consent");
  // Google adds newly granted scopes to what the person granted the client before.
  const grantedScopes = [...new Set([...(earlier?.scopes ?? []), ...scopes])];
  if (consentsNow) {
    const grant = { email, clientId: client.clientId, appName: client.name, scopes: grantedScopes };
    grantAccess(state, { ...grant, grantedAt: context.now() }, context.now());
  }
  const code = `4/0A${randomBytes(24).toString("base64url")}`;
  state.authorizationCodes.set(code, {
    email,
    clientId: client.clientId,
    // With `include_granted_scopes`, the token also holds what the person granted before.
    scopes:
      parameters.include_granted_scopes === "true"
        ? grantedScopes.filter((scope) => scope !== refused)
        : scopes,
    redirectUri: parameters.redirect_uri,
    nonce: parameters.nonce,
    issuesRefreshToken: consentsNow && parameters.access_type === "offline",
  });
  return code;
}

function showUserInfo(context: FakeGoogleContext): RequestHandler {
  return (request, response) => {
    const token = validAccessToken(context, request);
    const person = token === undefined ? undefined : findPerson(context.state, token.email);
    if (person === undefined) return sendGoogleError(response, "unauthenticated");
    response.json({
      sub: person.id,
      email: person.email,
      email_verified: true,
      name: fullName(person),
      given_name: person.givenName,
      family_name: person.familyName,
      hd: context.state.customer.domain,
    });
  };
}

/**
 * The authorization request's client and parameters, or undefined once Google's error page is
 * sent: Google never redirects to an address it cannot trust.
 */
function checkAuthorization(state: GoogleState, input: unknown, response: Response) {
  const target = REDIRECT_TARGET.parse(input ?? {});
  const client = state.clients.find(({ clientId }) => clientId === target.client_id);
  if (client === undefined) return refuseAuthorization(response, 401, "invalid_client");
  if (!client.redirectUris.includes(target.redirect_uri)) {
    return refuseAuthorization(response, 400, "redirect_uri_mismatch");
  }
  const parsed = AUTHORIZATION_REQUEST.safeParse(input);
  if (!parsed.success) return refuseAuthorization(response, 400, "invalid_request");
  return { client, parameters: parsed.data };
}

function refuseAuthorization(response: Response, status: number, error: string): undefined {
  response.status(status).type("html").send(authorizationErrorHtml(status, error));
  return undefined;
}

function redirectBack(
  response: Response,
  { redirect_uri, state }: AuthorizationRequest,
  answer: Record<string, string>,
): void {
  const url = new URL(redirect_uri);
  for (const [name, value] of Object.entries(answer)) url.searchParams.set(name, value);
  if (state !== undefined) url.searchParams.set("state", state);
  response.redirect(302, url.toString());
}
