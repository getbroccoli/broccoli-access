import type { GoogleClient, GoogleUser, NewGoogleUser } from "../../../integrations/google";
import { UnsuccessfulAnswerError } from "../../../utils";

/**
 * Creates the user with a first password they must change. Google's refusal of the address may be
 * an earlier try's user, which already has that password: one with this key and this primary
 * email is recognised as created. Any other user with the address stays Google's refusal.
 * Nothing is written to an existing user.
 */
export async function createOrRecogniseUser(
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
    if (existing?.creationKey !== user.creationKey || existing.email !== user.email) throw error;
    return existing;
  }
}

/** Google's answer to a new user whose address is taken. */
export const CONFLICT_STATUS = 409;
