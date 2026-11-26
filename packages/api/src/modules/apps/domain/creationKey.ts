import { createHash } from "node:crypto";

/**
 * The key Google keeps on the user a try creates: only a try that sent this first password can
 * have created a user with it, so a later try recognises exactly that user.
 */
export function creationKeyOf(password: string): string {
  return createHash("sha256").update(password).digest("base64url");
}
