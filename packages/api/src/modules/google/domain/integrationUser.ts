/** Google's scope for creating and changing the directory's users, asked for when first needed. */
export const GOOGLE_USER_WRITE_SCOPE = "https://www.googleapis.com/auth/admin.directory.user";

/** The Google Workspace user Broccoli Access creates for itself; its secrets are read apart. */
export interface IntegrationUser {
  /** The address the owner picked, in the directory's domain. */
  email: string;
  /** The directory's id for it, which the sync knows it by, never its email. */
  googleUserId: string;
  /** The user who created it. */
  createdBy: string;
  createdAt: Date;
}

/** The name the integration user has in the directory. */
export const INTEGRATION_USER_NAME = { givenName: "Broccoli", familyName: "Access" };

/**
 * The address the owner typed as the integration user's, trimmed and lowercased, when it is one of
 * the workspace's `domain`; otherwise why it is refused.
 */
export function parseIntegrationUserEmail(
  input: string,
  domain: string,
): { email: string } | { problem: "required" | "invalid" } {
  const email = input.trim().toLowerCase();
  if (email === "") {
    return { problem: "required" };
  }
  const separator = email.lastIndexOf("@");
  const isOfDomain = email.slice(separator + 1) === domain.toLowerCase();
  const hasLocalPart =
    separator > 0 && separator <= MAX_LOCAL_PART && LOCAL_PART.test(email.slice(0, separator));
  return isOfDomain && hasLocalPart ? { email } : { problem: "invalid" };
}

/** The longest username Google Workspace takes. */
const MAX_LOCAL_PART = 64;

/** Letters, digits and single separators inside, which every Google Workspace username allows. */
const LOCAL_PART = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

/** The admin did not allow creating and changing users at Google's consent. */
export class UserWriteRefusedError extends Error {
  constructor() {
    super("The admin did not allow creating and changing users");
    this.name = "UserWriteRefusedError";
  }
}

/** The directory already has a user or an alias with the address picked for the integration user. */
export class EmailTakenError extends Error {
  constructor() {
    super("The directory already has this address");
    this.name = "EmailTakenError";
  }
}
