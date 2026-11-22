import { createLocalJWKSet, type JWTVerifyGetKey } from "jose";
import { z } from "zod";

import { fetchJson } from "../../utils";

/** Google's OAuth 2.0, OpenID Connect and Directory endpoints, at the addresses the settings give. */
export interface GoogleClient {
  /** The OpenID Connect discovery document. */
  discover(): Promise<OpenIdConfiguration>;
  /** Trades an authorization code for tokens, server to server. */
  exchangeCode(openId: OpenIdConfiguration, exchange: CodeExchange): Promise<GoogleTokens>;
  /** Trades a refresh token for a new access token, server to server. */
  refreshAccessToken(openId: OpenIdConfiguration, refresh: TokenRefresh): Promise<string>;
  /** The keys that sign Google's ID tokens, from the discovery document's `jwks_uri`. */
  readSigningKeys(openId: OpenIdConfiguration): Promise<JWTVerifyGetKey>;
  /** The Workspace customer of the access token's admin. */
  readCustomer(accessToken: string): Promise<GoogleCustomer>;
  /** The customer's user with Google's user id `userId`, paging the Directory; null when absent. */
  findUser(accessToken: string, userId: string): Promise<GoogleUser | null>;
  /** One page of the customer's users, from a null page token; `nextPageToken` is null on the last. */
  listUsers(accessToken: string, pageToken: string | null): Promise<GoogleUserPage>;
}

export interface OpenIdConfiguration {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
}

export interface CodeExchange {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface TokenRefresh {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface GoogleTokens {
  accessToken: string;
  idToken: string;
  /** Only on a consent with `access_type=offline` that Google asked for now. */
  refreshToken: string | null;
  /** The scopes Google granted, `email` and `profile` by the short names a consent asks for. */
  scopes: string[];
}

export interface GoogleCustomer {
  domain: string;
  organizationName: string;
}

export interface GoogleUser {
  id: string;
  /** Lowercased. */
  email: string;
  givenName: string;
  familyName: string;
  fullName: string;
  isAdmin: boolean;
  suspended: boolean;
  /** The manager the user's relations name, lowercased; null without one. */
  managerEmail: string | null;
  /** The user as Google sent it. */
  raw: Record<string, unknown>;
}

export interface GoogleUserPage {
  users: GoogleUser[];
  nextPageToken: string | null;
}

export function createGoogleClient({
  openIdConfigurationUrl,
  adminApiUrl,
}: {
  openIdConfigurationUrl: string;
  adminApiUrl: string;
}): GoogleClient {
  const directoryUrl = (path: string) => new URL(`admin/directory/v1/${path}`, `${adminApiUrl}/`);
  return {
    discover: async () => {
      const document = await fetchRequired(new URL(openIdConfigurationUrl), OPEN_ID_CONFIGURATION);
      return {
        issuer: document.issuer,
        authorizationEndpoint: document.authorization_endpoint,
        tokenEndpoint: document.token_endpoint,
        jwksUri: document.jwks_uri,
      };
    },
    exchangeCode: async ({ tokenEndpoint }, { code, clientId, clientSecret, redirectUri }) => {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      });
      const tokens = await fetchRequired(new URL(tokenEndpoint), TOKEN_RESPONSE, {
        method: "POST",
        body,
      });
      return {
        accessToken: tokens.access_token,
        idToken: tokens.id_token,
        refreshToken: tokens.refresh_token ?? null,
        scopes: tokens.scope.split(" ").filter(Boolean).map(shortScopeName),
      };
    },
    refreshAccessToken: async ({ tokenEndpoint }, { clientId, clientSecret, refreshToken }) => {
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      });
      const tokens = await fetchRequired(new URL(tokenEndpoint), REFRESHED_TOKEN, {
        method: "POST",
        body,
      });
      return tokens.access_token;
    },
    readSigningKeys: async ({ jwksUri }) =>
      createLocalJWKSet(await fetchRequired(new URL(jwksUri), JSON_WEB_KEY_SET)),
    readCustomer: async (accessToken) => {
      const customer = await fetchRequired(
        directoryUrl("customers/my_customer"),
        CUSTOMER,
        bearer(accessToken),
      );
      return {
        domain: customer.customerDomain,
        organizationName: customer.postalAddress?.organizationName ?? customer.customerDomain,
      };
    },
    // shortcut: pages the user list because the fake Google has no `users.get`; read the one user
    // with `users.get` once the fake serves it, so a large directory takes one request.
    findUser: async (accessToken, userId) => {
      let pageToken: string | null = null;
      do {
        const page: GoogleUserPage = await readUserPage(directoryUrl, accessToken, pageToken);
        const user = page.users.find((candidate) => candidate.id === userId);
        if (user) {
          return user;
        }
        pageToken = page.nextPageToken;
      } while (pageToken !== null);
      return null;
    },
    listUsers: (accessToken, pageToken) => readUserPage(directoryUrl, accessToken, pageToken),
  };
}

/** Google answers within seconds; a slower answer fails the consent instead of holding it. */
const TIMEOUT_MS = 10_000;
/** Far above any answer these endpoints give, such as a page of 500 users. */
const MAX_BYTES = 5_000_000;
/** The Directory's largest page, so most companies take one request. */
const USERS_PER_PAGE = 500;

const OPEN_ID_CONFIGURATION = z.object({
  issuer: z.string(),
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  jwks_uri: z.url(),
});

const TOKEN_RESPONSE = z.object({
  access_token: z.string(),
  id_token: z.string(),
  refresh_token: z.string().optional(),
  scope: z.string(),
});

const REFRESHED_TOKEN = z.object({ access_token: z.string() });

const JSON_WEB_KEY_SET = z.object({
  keys: z.array(z.looseObject({ kty: z.string() })),
});

const CUSTOMER = z.object({
  customerDomain: z.string(),
  postalAddress: z.object({ organizationName: z.string().optional() }).optional(),
});

const DIRECTORY_USER = z.object({
  id: z.string(),
  primaryEmail: z.string(),
  name: z.object({
    givenName: z.string(),
    familyName: z.string(),
    fullName: z.string().optional(),
  }),
  isAdmin: z.boolean(),
  suspended: z.boolean(),
  relations: z.array(z.object({ type: z.string(), value: z.string() })).optional(),
});

// Users stay as Google sent them, so each keeps every field for its import record.
const USERS_PAGE = z.object({
  users: z.array(z.record(z.string(), z.unknown())).optional(),
  nextPageToken: z.string().optional(),
});

/** Google's token response names the `email` and `profile` scopes by their full names. */
const SHORT_SCOPE_NAMES: Partial<Record<string, string>> = {
  "https://www.googleapis.com/auth/userinfo.email": "email",
  "https://www.googleapis.com/auth/userinfo.profile": "profile",
};

/** An answer every call needs; a 404 is as wrong as any other failure here. */
async function fetchRequired<T>(url: URL, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const answer = await fetchJson(url, schema, { timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES, init });
  if (answer === null) {
    throw new Error(`${url.origin} answered 404`);
  }
  return answer;
}

async function readUserPage(
  directoryUrl: (path: string) => URL,
  accessToken: string,
  pageToken: string | null,
): Promise<GoogleUserPage> {
  const url = directoryUrl("users");
  url.search = new URLSearchParams({
    customer: "my_customer",
    maxResults: String(USERS_PER_PAGE),
    ...(pageToken !== null && { pageToken }),
  }).toString();
  const page = await fetchRequired(url, USERS_PAGE, bearer(accessToken));
  return {
    users: (page.users ?? []).map((user) => toGoogleUser(DIRECTORY_USER.parse(user), user)),
    nextPageToken: page.nextPageToken ?? null,
  };
}

function shortScopeName(scope: string): string {
  return SHORT_SCOPE_NAMES[scope] ?? scope;
}

function bearer(accessToken: string): RequestInit {
  return { headers: { authorization: `Bearer ${accessToken}` } };
}

function toGoogleUser(
  user: z.infer<typeof DIRECTORY_USER>,
  raw: Record<string, unknown>,
): GoogleUser {
  const { givenName, familyName, fullName = `${givenName} ${familyName}` } = user.name;
  const manager = user.relations?.find(({ type }) => type === "manager");
  return {
    id: user.id,
    email: user.primaryEmail.toLowerCase(),
    givenName,
    familyName,
    fullName,
    isAdmin: user.isAdmin,
    suspended: user.suspended,
    managerEmail: manager ? manager.value.toLowerCase() : null,
    raw,
  };
}
