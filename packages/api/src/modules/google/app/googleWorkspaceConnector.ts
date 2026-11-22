import {
  type Connector,
  ConnectorError,
  type ConnectorErrorCode,
  type ImportedAccount,
} from "../../../core/connectors";
import {
  createGoogleClient,
  type GoogleClient,
  type GoogleToken,
  type GoogleUser,
} from "../../../integrations/google";
import { UnsuccessfulAnswerError } from "../../../utils";
import {
  GOOGLE_WORKSPACE,
  GOOGLE_WORKSPACE_SECRETS,
  GOOGLE_WORKSPACE_SETTINGS,
  parseGoogleWorkspaceSettings,
} from "../domain";

/**
 * The Google Workspace connector: reads the directory's users, and the apps each granted access
 * with Google, dated from the token log, with the connection's refresh token.
 */
export function createGoogleWorkspaceConnector(addresses: {
  /** `GOOGLE_OPENID_CONFIGURATION_URL`. */
  openIdConfigurationUrl: string;
  /** `GOOGLE_ADMIN_API_URL`. */
  adminApiUrl: string;
}): Connector {
  const google = createGoogleClient(addresses);
  return {
    key: GOOGLE_WORKSPACE,
    version: 1,
    name: APP_NAME,
    transport: "api",
    findingKinds: { ownAppAccounts: "google_directory", otherAppAccounts: "google_sign_in" },
    isDirectory: true,
    connectionFields: [
      { key: "clientId", secret: false },
      { key: "clientSecret", secret: true },
      { key: "refreshToken", secret: true },
    ],
    settings: GOOGLE_WORKSPACE_SETTINGS,
    secrets: GOOGLE_WORKSPACE_SECRETS,
    sourceName: (settings) => parseGoogleWorkspaceSettings(settings).domain,
    async openSession(connection) {
      const { clientId } = parseGoogleWorkspaceSettings(connection.settings);
      const secrets = GOOGLE_WORKSPACE_SECRETS.parse(connection.secrets);
      const accessToken = await asConnectorError(signInError, async () =>
        google.refreshAccessToken(await google.discover(), { clientId, ...secrets }),
      );
      const readGrantLog = onceUntilRead(() =>
        grantLogSince(google, accessToken, new Date(Date.now() - GRANT_LOG_MS)),
      );
      return {
        testConnection: () =>
          asConnectorError(directoryError, async () => google.readCustomer(accessToken)),
        listAccounts: (cursor) =>
          asConnectorError(directoryError, async () => {
            const page = await google.listUsers(accessToken, cursor);
            const grants = await grantAccounts(google, accessToken, page.users, {
              ownClientId: clientId,
              log: await readGrantLog(),
            });
            const accounts = [...page.users.map(directoryAccount), ...grants];
            return { accounts, nextCursor: page.nextPageToken };
          }),
      };
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

/** The users' grants, except to the instance's own Google app, which is not one of the company's apps. */
async function grantAccounts(
  google: GoogleClient,
  accessToken: string,
  users: readonly GoogleUser[],
  { ownClientId, log }: { ownClientId: string; log: GrantLog },
): Promise<ImportedAccount[]> {
  const accounts: ImportedAccount[] = [];
  for (let start = 0; start < users.length; start += TOKEN_LISTS_AT_ONCE) {
    const batch = users.slice(start, start + TOKEN_LISTS_AT_ONCE);
    const tokenLists = await Promise.all(
      batch.map((user) => google.listTokens(accessToken, user.id)),
    );
    batch.forEach((user, index) => {
      const tokens = tokenLists[index]!.filter(({ clientId }) => clientId !== ownClientId);
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
    },
  };
}

function grantKey(userId: string, clientId: string): string {
  return `${userId}:${clientId}`;
}

/** A directory user as an account of Google Workspace itself. */
function directoryAccount(user: GoogleUser): ImportedAccount {
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
    },
  };
}

/** Runs a call to Google, turning any failure into the connector error it means. */
async function asConnectorError<T>(
  errorOfStatus: (status: number) => ConnectorErrorCode,
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw new ConnectorError(connectorErrorCode(error, errorOfStatus));
  }
}

function connectorErrorCode(
  error: unknown,
  errorOfStatus: (status: number) => ConnectorErrorCode,
): ConnectorErrorCode {
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
