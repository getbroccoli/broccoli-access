import { createLocalJWKSet, type JWTVerifyGetKey } from "jose";
import { z } from "zod";

import { imageTypeOf, type ImageType } from "../../utils";
import { bearer, fetchGoogleJson, fetchRequired } from "./fetchGoogleJson";
import { type GoogleGrantEventPage, readGrantEventPage } from "./grantEventPage";

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
  /**
   * The user's photo, which Google downsizes to 96×96; null when the user has none. Refuses a
   * photo whose bytes are not the image type Google declares, or over `MAX_PHOTO_BYTES`.
   */
  readPhoto(accessToken: string, userId: string): Promise<GooglePhoto | null>;
  /** The apps the user with Google's user id `userId` granted access; empty once the user is gone. */
  listTokens(accessToken: string, userId: string): Promise<GoogleToken[]>;
  /** One page of the `authorize` events logged since `startTime`, from a null page token. */
  listGrantEvents(
    accessToken: string,
    page: { startTime: Date; pageToken: string | null },
  ): Promise<GoogleGrantEventPage>;
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

export interface GooglePhoto {
  content: Buffer;
  mimeType: ImageType;
}

/** An app's grant to a user, from the user's tokens list. */
export interface GoogleToken {
  clientId: string;
  /** The app's name as Google shows it; the client id when Google gives none. */
  displayText: string;
  /** The token as Google sent it. */
  raw: Record<string, unknown>;
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
    readPhoto: async (accessToken, userId) => {
      const url = directoryUrl(`users/${encodeURIComponent(userId)}/photos/thumbnail`);
      const photo = await fetchGoogleJson(url, USER_PHOTO, bearer(accessToken));
      return photo && parsePhoto(photo);
    },
    listTokens: async (accessToken, userId) => {
      const url = directoryUrl(`users/${encodeURIComponent(userId)}/tokens`);
      const list = await fetchGoogleJson(url, TOKEN_LIST, bearer(accessToken));
      return (list?.items ?? []).map((token) => toGoogleToken(TOKEN.parse(token), token));
    },
    listGrantEvents: (accessToken, page) => readGrantEventPage(adminApiUrl, accessToken, page),
  };
}

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

const USER_PHOTO = z.object({ mimeType: z.string(), photoData: z.string() });

/** Far above a 96×96 thumbnail, so only an answer that is no thumbnail goes over it. */
const MAX_PHOTO_BYTES = 256 * 1024;

// Tokens stay as Google sent them, so each keeps every field for its import record.
const TOKEN_LIST = z.object({ items: z.array(z.record(z.string(), z.unknown())).optional() });

const TOKEN = z.object({ clientId: z.string(), displayText: z.string().optional() });

/** Google's token response names the `email` and `profile` scopes by their full names. */
const SHORT_SCOPE_NAMES: Partial<Record<string, string>> = {
  "https://www.googleapis.com/auth/userinfo.email": "email",
  "https://www.googleapis.com/auth/userinfo.profile": "profile",
};

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

/**
 * The photo's bytes, when they are the JPEG, PNG or GIF Google declares, which browsers show and
 * never run as a page, and stay within `MAX_PHOTO_BYTES`.
 */
function parsePhoto({ mimeType, photoData }: z.infer<typeof USER_PHOTO>): GooglePhoto {
  // Node's base64url decoder also reads the `*` and `.` padding Google's web-safe base64 allows.
  const content = Buffer.from(photoData, "base64url");
  if (content.length > MAX_PHOTO_BYTES) {
    throw new Error(`The photo is larger than ${MAX_PHOTO_BYTES} bytes`);
  }
  const type = imageTypeOf(content);
  if (type !== mimeType) {
    throw new Error("The photo's bytes are not the image type Google declares");
  }
  return { content, mimeType: type };
}

function shortScopeName(scope: string): string {
  return SHORT_SCOPE_NAMES[scope] ?? scope;
}

function toGoogleToken(token: z.infer<typeof TOKEN>, raw: Record<string, unknown>): GoogleToken {
  return { clientId: token.clientId, displayText: token.displayText ?? token.clientId, raw };
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
