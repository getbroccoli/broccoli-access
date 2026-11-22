import {
  type Connector,
  ConnectorError,
  type ConnectorErrorCode,
  type ImportedAccount,
} from "../../../core/connectors";
import { createGoogleClient, type GoogleUser } from "../../../integrations/google";
import { UnsuccessfulAnswerError } from "../../../utils";
import {
  GOOGLE_WORKSPACE,
  GOOGLE_WORKSPACE_SECRETS,
  GOOGLE_WORKSPACE_SETTINGS,
  parseGoogleWorkspaceSettings,
} from "../domain";

/** The Google Workspace connector: reads the directory's users with the connection's refresh token. */
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
      return {
        testConnection: () =>
          asConnectorError(directoryError, async () => google.readCustomer(accessToken)),
        listAccounts: (cursor) =>
          asConnectorError(directoryError, async () => {
            const page = await google.listUsers(accessToken, cursor);
            return { accounts: page.users.map(directoryAccount), nextCursor: page.nextPageToken };
          }),
      };
    },
  };
}

const APP_NAME = "Google Workspace";

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
