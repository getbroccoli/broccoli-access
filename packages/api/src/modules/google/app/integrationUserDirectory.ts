import { ApplicationError } from "../../../core/applicationError";
import type { GoogleClient } from "../../../integrations/google";
import { UnsuccessfulAnswerError } from "../../../utils";
import {
  EmailTakenError,
  GOOGLE_USER_WRITE_SCOPE,
  googleRedirectAddress,
  type GoogleWorkspaceSettings,
  INTEGRATION_USER_NAME,
  requireSameWorkspace,
  UserWriteRefusedError,
} from "../domain";
import { readSuperAdmin, verifyIdentity } from "./googleConsent";

/**
 * Exchanges the code and checks that a super admin of the connected workspace allowed creating
 * users, on top of everything the connection was granted before.
 */
export async function verifyWriteGrant(
  google: GoogleClient,
  { settings, clientSecret }: { settings: GoogleWorkspaceSettings; clientSecret: string },
  answer: { code?: string; handle?: string; publicOrigin: string; nonce: string; now: Date },
): Promise<WriteGrant> {
  const { tokens, identity } = await verifyIdentity(
    google,
    { clientId: settings.clientId, clientSecret, nonce: answer.nonce },
    { ...answer, redirectUri: googleRedirectAddress(answer.publicOrigin) },
  );
  if (!tokens.scopes.includes(GOOGLE_USER_WRITE_SCOPE)) {
    throw new UserWriteRefusedError();
  }
  const admin = await readSuperAdmin(google, tokens.accessToken, identity);
  requireSameWorkspace(settings, admin.domain);
  const { accessToken, refreshToken, scopes } = tokens;
  // Its refresh token replaces the connection's, so it must read all the scans read.
  if (refreshToken === null || settings.grantedScopes.some((scope) => !scopes.includes(scope))) {
    throw new ApplicationError("INVALID_INPUT", "Google's grant does not hold the earlier one.");
  }
  return { accessToken, refreshToken, scopes, adminEmail: admin.email };
}

/** Creates the user in the directory and returns its id; a taken address is `EmailTakenError`. */
export async function createDirectoryUser(
  google: GoogleClient,
  accessToken: string,
  user: { email: string; password: string },
): Promise<string> {
  try {
    const created = await google.createUser(accessToken, { ...user, ...INTEGRATION_USER_NAME });
    return created.id;
  } catch (error) {
    throw error instanceof UnsuccessfulAnswerError && error.status === CONFLICT_STATUS
      ? new EmailTakenError()
      : error;
  }
}

/** What the consent granted: a token that may create users, and the grown grant to store. */
export interface WriteGrant {
  accessToken: string;
  refreshToken: string;
  scopes: string[];
  /** The super admin who consented, whose refresh token the connection now uses. */
  adminEmail: string;
}

const CONFLICT_STATUS = 409;
