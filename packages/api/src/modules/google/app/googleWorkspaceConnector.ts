import {
  type Connector,
  ConnectorError,
  type ConnectorErrorCode,
  type ImportedAccount,
} from "../../../core/connectors";
import {
  createGoogleClient,
  createGoogleRelayClient,
  GoogleRelayError,
  type GoogleClient,
  type GoogleToken,
  type GoogleUser,
} from "../../../integrations/google";
import { UnsuccessfulAnswerError } from "../../../utils";
import { CONFLICT_STATUS, createOrRecogniseUser } from "./createOrRecogniseUser";
import {
  GOOGLE_WORKSPACE,
  GOOGLE_USER_WRITE_SCOPE,
  GOOGLE_WORKSPACE_SECRETS,
  GOOGLE_WORKSPACE_SETTINGS,
  parseGoogleWorkspaceSettings,
} from "../domain";

/**
 * The Google Workspace connector: reads the directory's users, and the apps each granted access
 * with Google, dated from the token log, with the connection's refresh token; suspends and
 * restores a user once the admin allowed changing users.
 */
export function createGoogleWorkspaceConnector(addresses: {
  /** `GOOGLE_OPENID_CONFIGURATION_URL`. */
  openIdConfigurationUrl: string;
  /** `GOOGLE_ADMIN_API_URL`. */
  adminApiUrl: string;
  relayUrl?: string;
}): Connector {
  const google = createGoogleClient(addresses);
  return {
    key: GOOGLE_WORKSPACE,
    version: 1,
    name: APP_NAME,
    capabilities: ["list_accounts", "suspend", "reactivate", "invite"],
    runtimes: ["server"],
    findingKinds: { ownAppAccounts: "google_directory", otherAppAccounts: "google_sign_in" },
    isDirectory: true,
    connectionFields: [
      { key: "clientId", secret: false },
      { key: "clientSecret", secret: true },
      { key: "refreshToken", secret: true },
    ],
    settings: GOOGLE_WORKSPACE_SETTINGS,
    secrets: GOOGLE_WORKSPACE_SECRETS,
    async openSession(connection) {
      const { clientId, previousClientIds, googleApp, adminEmail, domain, grantedScopes } =
        parseGoogleWorkspaceSettings(connection.settings);
      const accessToken =
        googleApp === "broccoli_google_app"
          ? await refreshShared(addresses.relayUrl, connection.secrets)
          : await refreshOwn(google, clientId, connection.secrets);
      const readGrantLog = onceUntilRead(() =>
        grantLogSince(google, accessToken, new Date(Date.now() - GRANT_LOG_MS)),
      );
      // Kept for the session, so a page the scan tries again reads only the lists that failed.
      const tokenListsByUser = new Map<string, GoogleToken[]>();
      const readTokens = async (userId: string) => {
        const tokens =
          tokenListsByUser.get(userId) ?? (await google.listTokens(accessToken, userId));
        tokenListsByUser.set(userId, tokens);
        return tokens;
      };
      return {
        testConnection: () =>
          asConnectorError(directoryError, async () => google.readCustomer(accessToken)),
        listAccounts: (cursor) =>
          asConnectorError(directoryError, async () => {
            const page = await google.listUsers(accessToken, cursor);
            const grants = await grantAccounts(page.users, {
              readTokens,
              ownClientIds: new Set([clientId, ...previousClientIds]),
              log: await readGrantLog(),
            });
            const accounts = [
              ...page.users.map((user) => directoryAccount(user, adminEmail)),
              ...grants,
            ];
            return { accounts, nextCursor: page.nextPageToken };
          }),
        readPhoto: (userId) =>
          asConnectorError(directoryError, async () => google.readPhoto(accessToken, userId)),
        createDirectoryAccount: ({ key, sentBefore, email, firstName, lastName, password }) =>
          asConnectorError(
            (status) => (status === CONFLICT_STATUS ? "not_allowed" : directoryError(status)),
            async () => {
              if (!grantedScopes.includes(GOOGLE_USER_WRITE_SCOPE))
                throw new ConnectorError("permission_missing");
              if (email.split("@").at(-1) !== domain.toLowerCase())
                throw new ConnectorError("wrong_workspace");
              const user = await createOrRecogniseUser(
                google,
                accessToken,
                { email, givenName: firstName, familyName: lastName, password, creationKey: key },
                sentBefore,
              );
              if (user.email !== email || user.suspended)
                throw new ConnectorError("unexpected_response");
            },
          ),
        runAction: (action, { sourceKey, email }) =>
          asConnectorError(directoryError, async () => {
            // Also for a scan record older than its `isConnectionUser`: the connection would end.
            if (action === "suspend" && isConnectionAdmin(email, adminEmail)) {
              throw new ConnectorError("not_allowed");
            }
            const user = await google.setUserSuspended(
              accessToken,
              sourceKey,
              action === "suspend",
            );
            if (!user) throw new ConnectorError("account_not_found");
            return { status: user.suspended ? "suspended" : "active" };
          }),
      };
    },
    // Google gives a user's photo etag only to a user with a photo.
    photoVersion: ({ thumbnailPhotoEtag }) =>
      typeof thumbnailPhotoEtag === "string" ? thumbnailPhotoEtag : null,
    withoutPhotoVersion: (raw) => {
      const user = { ...raw };
      delete user.thumbnailPhotoEtag;
      return user;
    },
  };
}

const APP_NAME = "Google Workspace";

/** Google keeps about 180 days of the token log; an older grant has no event. */
const GRANT_LOG_MS = 180 * 24 * 60 * 60 * 1000;

/** Tokens lists read at once: fast for a large directory, well inside Google's per-minute quota. */
const TOKEN_LISTS_AT_ONCE = 10;

/** The token log a scan read: where it starts, and each grant's earliest event by source key. */
interface GrantLog {
  start: Date;
  grantedAt: Map<string, Date>;
}

/** `read`'s answer, read on the first call only; a failed read is tried again on the next call. */
function onceUntilRead<T>(read: () => Promise<T>): () => Promise<T> {
  let answer: Promise<T> | undefined;
  return () => {
    answer ??= read().catch((error: unknown) => {
      answer = undefined;
      throw error;
    });
    return answer;
  };
}

/** Every `authorize` event since `start`, keeping each grant's earliest. */
async function grantLogSince(
  google: GoogleClient,
  accessToken: string,
  start: Date,
): Promise<GrantLog> {
  const grantedAt = new Map<string, Date>();
  let pageToken: string | null = null;
  do {
    const page = await google.listGrantEvents(accessToken, { startTime: start, pageToken });
    for (const { userId, clientId, time } of page.events) {
      const key = grantKey(userId, clientId);
      const earliest = grantedAt.get(key);
      if (!earliest || time < earliest) {
        grantedAt.set(key, time);
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken !== null);
  return { start, grantedAt };
}

/**
 * The users' grants, except to the instance's own Google apps, current and previous, which are not
 * the company's apps.
 */
async function grantAccounts(
  users: readonly GoogleUser[],
  {
    readTokens,
    ownClientIds,
    log,
  }: {
    readTokens: (userId: string) => Promise<GoogleToken[]>;
    ownClientIds: ReadonlySet<string>;
    log: GrantLog;
  },
): Promise<ImportedAccount[]> {
  const accounts: ImportedAccount[] = [];
  for (let start = 0; start < users.length; start += TOKEN_LISTS_AT_ONCE) {
    const batch = users.slice(start, start + TOKEN_LISTS_AT_ONCE);
    const tokenLists = await Promise.all(batch.map((user) => readTokens(user.id)));
    batch.forEach((user, index) => {
      const tokens = tokenLists[index]!.filter(({ clientId }) => !ownClientIds.has(clientId));
      accounts.push(...tokens.map((token) => grantAccount(user, token, log)));
    });
  }
  return accounts;
}

/** A user's grant as their account in the app; undated when the grant is older than the log. */
function grantAccount(user: GoogleUser, token: GoogleToken, log: GrantLog): ImportedAccount {
  const sourceKey = grantKey(user.id, token.clientId);
  const grantedAt = log.grantedAt.get(sourceKey);
  return {
    sourceKey,
    raw: token.raw,
    values: {
      email: user.email,
      status: "active",
      firstName: null,
      lastName: null,
      managerEmail: null,
      appName: token.displayText,
      appExternalId: `google:${token.clientId}`,
      grantedAt: grantedAt?.toISOString() ?? null,
      grantedBefore: grantedAt ? null : log.start.toISOString(),
      displayName: null,
      isConnectionUser: false,
    },
  };
}

function grantKey(userId: string, clientId: string): string {
  return `${userId}:${clientId}`;
}

/**
 * A directory user as an account of Google Workspace itself; the admin whose refresh token the
 * connection uses is its own user, so nobody suspends the account every scan and change runs as.
 */
function directoryAccount(user: GoogleUser, adminEmail: string): ImportedAccount {
  return {
    sourceKey: user.id,
    raw: user.raw,
    values: {
      email: user.email,
      status: user.suspended ? "suspended" : "active",
      firstName: user.givenName,
      lastName: user.familyName,
      managerEmail: user.managerEmail,
      appName: APP_NAME,
      appExternalId: null,
      grantedAt: null,
      grantedBefore: null,
      displayName: null,
      isConnectionUser: isConnectionAdmin(user.email, adminEmail),
    },
  };
}

function isConnectionAdmin(email: string, adminEmail: string): boolean {
  return email.toLowerCase() === adminEmail.toLowerCase();
}

/** Runs a call to Google, turning any failure into the connector error it means. */
async function asConnectorError<T>(
  errorOfStatus: (status: number) => ConnectorErrorCode,
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof ConnectorError) {
      throw error;
    }
    throw new ConnectorError(connectorErrorCode(error, errorOfStatus));
  }
}

function connectorErrorCode(
  error: unknown,
  errorOfStatus: (status: number) => ConnectorErrorCode,
): ConnectorErrorCode {
  if (error instanceof GoogleRelayError)
    return error.code === "invalid_handoff" ? "unexpected_response" : error.code;
  if (error instanceof UnsuccessfulAnswerError) {
    return errorOfStatus(error.status);
  }
  return isUnanswered(error) ? "app_unavailable" : "unexpected_response";
}

/** The token endpoint refuses a revoked or expired refresh token, and a wrong secret, with a 4xx. */
function signInError(status: number): ConnectorErrorCode {
  if (status === TOO_MANY_REQUESTS || status >= SERVER_ERROR) {
    return directoryError(status);
  }
  return "authentication_failed";
}

// shortcut: Google also answers some rate limits with 403 `rateLimitExceeded`, read here as a
// missing permission; tell them apart by the error body once a real directory shows it.
function directoryError(status: number): ConnectorErrorCode {
  if (status === UNAUTHORIZED) {
    return "authentication_failed";
  }
  if (status === FORBIDDEN) {
    return "permission_missing";
  }
  if (status === TOO_MANY_REQUESTS) {
    return "rate_limited";
  }
  return status >= SERVER_ERROR ? "app_unavailable" : "unexpected_response";
}

/** No answer: the call timed out or the connection failed. */
function isUnanswered(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof DOMException && ["TimeoutError", "AbortError"].includes(error.name))
  );
}

const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR = 500;

async function refreshShared(relayUrl: string | undefined, secrets: unknown): Promise<string> {
  const { refreshToken } = GOOGLE_WORKSPACE_SECRETS.omit({ clientSecret: true })
    .strict()
    .parse(secrets);
  return asConnectorError(signInError, async () => {
    if (!relayUrl) throw new TypeError("The Google relay is unavailable");
    return createGoogleRelayClient(relayUrl).refresh(refreshToken);
  });
}

async function refreshOwn(
  google: GoogleClient,
  clientId: string,
  secrets: unknown,
): Promise<string> {
  const credentials = GOOGLE_WORKSPACE_SECRETS.required().parse(secrets);
  return asConnectorError(signInError, async () =>
    google.refreshAccessToken(await google.discover(), { clientId, ...credentials }),
  );
}
