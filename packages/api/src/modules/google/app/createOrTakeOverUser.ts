import type { GoogleClient, GoogleUser, NewGoogleUser } from "../../../integrations/google";
import { UnsuccessfulAnswerError } from "../../../utils";

/**
 * Creates the user with a first password they must change, or takes over the one an earlier try
 * with the same key created while it still waits for that first sign-in; any other user with the
 * address, or one someone has since used, suspended or made an admin, stays Google's refusal.
 */
export async function createOrTakeOverUser(
  google: GoogleClient,
  accessToken: string,
  user: Omit<NewGoogleUser, "changePasswordAtNextLogin"> & { creationKey: string },
): Promise<GoogleUser> {
  try {
    return await google.createUser(accessToken, { ...user, changePasswordAtNextLogin: true });
  } catch (error) {
    if (!(error instanceof UnsuccessfulAnswerError) || error.status !== CONFLICT_STATUS)
      throw error;
    const existing = await google.findUser(accessToken, user.email);
    if (existing?.creationKey !== user.creationKey || !awaitsFirstSignIn(existing)) throw error;
    const takenOver = await google.setPassword(accessToken, existing.id, user.password);
    if (!takenOver) throw error;
    return takenOver;
  }
}

function awaitsFirstSignIn(user: GoogleUser): boolean {
  return !user.suspended && !user.isAdmin && user.mustChangePassword && user.signedInAt === null;
}

/** Google's answer to a new user whose address is taken. */
export const CONFLICT_STATUS = 409;
