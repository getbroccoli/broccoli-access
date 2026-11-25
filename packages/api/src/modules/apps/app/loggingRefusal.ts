import { ApplicationError } from "../../../core/applicationError";
import type { Logger } from "../../../core/logger";

/**
 * Runs the owner's ask and logs an expected refusal before passing it on: the ids it was about, the
 * error's code and each refused field's problem, never the input (RULE31).
 */
export async function loggingRefusal<Result>(
  logger: Logger,
  refusal: { message: string; ids: Record<string, string | null> },
  ask: () => Promise<Result>,
): Promise<Result> {
  try {
    return await ask();
  } catch (error) {
    if (error instanceof ApplicationError) {
      const problems = error.fieldErrors.map(({ field, code }) => `${field}: ${code}`);
      logger.info({ ...refusal.ids, code: error.code, problems }, refusal.message);
    }
    throw error;
  }
}
