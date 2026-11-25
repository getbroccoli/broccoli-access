import type { GoogleClient, GoogleUser, NewGoogleUser } from "../../../integrations/google";
import { UnsuccessfulAnswerError } from "../../../utils";

/**
 * Creates the user with a first password they must change, or takes over the one an earlier try
 * with the same key created, whose first password was never shown; any other user with the
 * address stays Google's duplicate refusal.
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
    if (!existing || existing.creationKey !== user.creationKey) throw error;
    const takenOver = await google.setPassword(accessToken, existing.id, user.password);
    if (!takenOver) throw error;
    return takenOver;
  }
}

/** Google's answer to a new user whose address is taken. */
export const CONFLICT_STATUS = 409;
