import type { GoogleClient } from "../../../integrations/google";
import { UnsuccessfulAnswerError } from "../../../utils";
import { EmailTakenError, INTEGRATION_USER_NAME } from "../domain";

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

const CONFLICT_STATUS = 409;
