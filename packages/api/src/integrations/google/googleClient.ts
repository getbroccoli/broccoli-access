import { createLocalJWKSet, type JWTVerifyGetKey } from "jose";
import { z } from "zod";

import { imageTypeOf, type ImageType } from "../../utils";
import { bearer, fetchGoogleJson, fetchRequired } from "./fetchGoogleJson";
import { shortScopeName } from "./shortScopeName";
import { creationKeyIds, type GoogleUser, parseGoogleUser } from "./directoryUser";
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
  /** The customer's user whose Google id or primary email is `userKey`; null when absent. */
  findUser(accessToken: string, userKey: string): Promise<GoogleUser | null>;
  /** Creates a user who keeps the password given; Google refuses a taken address with a 409. */
  createUser(accessToken: string, user: NewGoogleUser): Promise<GoogleUser>;
  /** Gives the user a password they must change at their next sign-in; null for an unknown user. */
  setPassword(accessToken: string, userId: string, password: string): Promise<GoogleUser | null>;
  /** Suspends or restores the user and answers the user as Google then has it; null for an unknown one. */
  setUserSuspended(
    accessToken: string,
    userId: string,
    suspended: boolean,
  ): Promise<GoogleUser | null>;
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

export interface NewGoogleUser {
  email: string;
  givenName: string;
  familyName: string;
  password: string;
  changePasswordAtNextLogin?: boolean;
  /** Kept on the user as an external id, so a retry finds the user an earlier try created. */
  creationKey?: string;
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
    findUser: async (accessToken, userKey) => {
      const url = directoryUrl(`users/${encodeURIComponent(userKey)}`);
      const user = await fetchGoogleJson(url, RAW_RECORD, bearer(accessToken));
      return user && parseGoogleUser(user);
    },
    createUser: async (
      accessToken,
      { email, givenName, familyName, password, changePasswordAtNextLogin = false, creationKey },
    ) => {
      const user = await writeUser(directoryUrl("users"), accessToken, "POST", {
        primaryEmail: email,
        name: { givenName, familyName },
        password,
        changePasswordAtNextLogin,
        ...(creationKey && {
          externalIds: creationKeyIds(creationKey),
        }),
      });
      if (!user) {
        throw new Error("Google answered 404 to a new user");
      }
      return user;
    },
    setPassword: (accessToken, userId, password) =>
      writeUser(directoryUrl(`users/${encodeURIComponent(userId)}`), accessToken, "PUT", {
        password,
        changePasswordAtNextLogin: true,
      }),
    setUserSuspended: (accessToken, userId, suspended) =>
      writeUser(directoryUrl(`users/${encodeURIComponent(userId)}`), accessToken, "PUT", {
        suspended,
      }),
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

const RAW_RECORD = z.record(z.string(), z.unknown());

// Users stay as Google sent them, so each keeps every field for its import record.
const USERS_PAGE = z.object({
  users: z.array(RAW_RECORD).optional(),
  nextPageToken: z.string().optional(),
});

const USER_PHOTO = z.object({ mimeType: z.string(), photoData: z.string() });

/** Far above a 96×96 thumbnail, so only an answer that is no thumbnail goes over it. */
const MAX_PHOTO_BYTES = 256 * 1024;

// Tokens stay as Google sent them, so each keeps every field for its import record.
const TOKEN_LIST = z.object({ items: z.array(z.record(z.string(), z.unknown())).optional() });

const TOKEN = z.object({ clientId: z.string(), displayText: z.string().optional() });

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
    users: (page.users ?? []).map((user) => parseGoogleUser(user)),
    nextPageToken: page.nextPageToken ?? null,
  };
}

/**
 * The photo's bytes, when they are the JPEG, PNG or GIF Google declares, which browsers show and
 * never run as a page, and stay within `MAX_PHOTO_BYTES`.
 */
/** Sends a user write and answers the user as Google then has it; null for a 404. */
async function writeUser(
  url: URL,
  accessToken: string,
  method: "POST" | "PUT",
  body: Record<string, unknown>,
): Promise<GoogleUser | null> {
  const user = await fetchGoogleJson(url, RAW_RECORD, {
    method,
    headers: { ...bearer(accessToken).headers, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return user && parseGoogleUser(user);
}

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

function toGoogleToken(token: z.infer<typeof TOKEN>, raw: Record<string, unknown>): GoogleToken {
  return { clientId: token.clientId, displayText: token.displayText ?? token.clientId, raw };
}
