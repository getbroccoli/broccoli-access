import { ApplicationError } from "../../../core/applicationError";
import type {
  GoogleClient,
  GoogleCustomer,
  GoogleTokens,
  GoogleUser,
  OpenIdConfiguration,
} from "../../../integrations/google";
import { UnsuccessfulAnswerError } from "../../../utils";
import { GOOGLE_WORKSPACE_SCOPES, NotSuperAdminError } from "../domain";
import { type ConsentState, type GoogleIdentity, verifyIdToken } from "../helpers";

/** The consenting super admin and their Workspace customer. */
export type SuperAdmin = GoogleUser & GoogleCustomer;

/** What Google's answer proved: the tokens it granted, with a refresh token, and who consented. */
export interface VerifiedGrant {
  tokens: GoogleTokens & { refreshToken: string };
  identity: GoogleIdentity;
}

/** Exchanges the code and checks the ID token, the refresh token and every scope asked for. */
export async function verifyGrant(
  google: GoogleClient,
  { clientId, clientSecret, nonce }: ConsentState,
  { code, redirectUri, now }: { code: string; redirectUri: string; now: Date },
): Promise<VerifiedGrant> {
  const openId = await google.discover();
  const tokens = await refusingRejectedCode(() =>
    google.exchangeCode(openId, {
      code,
      clientId,
      clientSecret,
      redirectUri,
    }),
  );
  const identity = await verifiedIdentity(google, openId, tokens.idToken, { clientId, nonce, now });
  const { refreshToken } = tokens;
  if (refreshToken === null) {
    throw new ApplicationError("INVALID_INPUT", "Google gave no refresh token.");
  }
  if (GOOGLE_WORKSPACE_SCOPES.some((scope) => !tokens.scopes.includes(scope))) {
    throw new ApplicationError("INVALID_INPUT", "The admin did not allow every permission.");
  }
  return { tokens: { ...tokens, refreshToken }, identity };
}

/** Google refuses a used or expired code, and a wrong client secret, with a 4xx answer. */
async function refusingRejectedCode<T>(exchange: () => Promise<T>): Promise<T> {
  try {
    return await exchange();
  } catch (error) {
    throw error instanceof UnsuccessfulAnswerError && error.status < SERVER_ERROR_STATUS
      ? new ApplicationError("INVALID_INPUT", `Google refused the code with ${error.status}.`)
      : error;
  }
}

const SERVER_ERROR_STATUS = 500;

async function verifiedIdentity(
  google: GoogleClient,
  openId: OpenIdConfiguration,
  idToken: string,
  { clientId, nonce, now }: { clientId: string; nonce: string; now: Date },
): Promise<GoogleIdentity> {
  const keys = await google.readSigningKeys(openId);
  try {
    return await verifyIdToken(idToken, { keys, issuer: openId.issuer, clientId, nonce, now });
  } catch {
    throw new ApplicationError("INVALID_INPUT", "Google's ID token did not verify.");
  }
}

/** The consenting user and their customer, refused with `NotSuperAdminError` unless a super admin. */
export async function readSuperAdmin(
  google: GoogleClient,
  accessToken: string,
  { sub }: GoogleIdentity,
): Promise<SuperAdmin> {
  try {
    const customer = await google.readCustomer(accessToken);
    const user = await google.findUser(accessToken, sub);
    if (!user?.isAdmin) {
      throw new NotSuperAdminError();
    }
    return { ...user, ...customer };
  } catch (error) {
    // The Directory refuses anyone but an admin.
    throw error instanceof UnsuccessfulAnswerError && error.status === FORBIDDEN_STATUS
      ? new NotSuperAdminError()
      : error;
  }
}

const FORBIDDEN_STATUS = 403;
