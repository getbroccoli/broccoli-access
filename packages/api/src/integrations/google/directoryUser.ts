import { z } from "zod";

export interface GoogleUser {
  id: string;
  /** Lowercased. */
  email: string;
  givenName: string;
  familyName: string;
  fullName: string;
  isAdmin: boolean;
  suspended: boolean;
  /** The manager the user's relations name, lowercased; null without one. */
  managerEmail: string | null;
  /** The `creationKey` Broccoli Access created the user with; null for any other user. */
  creationKey: string | null;
  /** Whether their next sign-in must change the password, as after a first password. */
  mustChangePassword: boolean;
  /** When they last signed in; null if never. */
  signedInAt: Date | null;
  /** The user as Google sent it. */
  raw: Record<string, unknown>;
}

/** The Directory user Google sent, keeping every field it sent as `raw`. */
export function parseGoogleUser(raw: Record<string, unknown>): GoogleUser {
  const user = DIRECTORY_USER.parse(raw);
  const { givenName, familyName, fullName = `${givenName} ${familyName}` } = user.name;
  const manager = user.relations?.find(({ type }) => type === "manager");
  return {
    id: user.id,
    email: user.primaryEmail.toLowerCase(),
    givenName,
    familyName,
    fullName,
    isAdmin: user.isAdmin,
    suspended: user.suspended,
    managerEmail: manager ? manager.value.toLowerCase() : null,
    creationKey:
      user.externalIds?.find(({ customType }) => customType === CREATION_KEY_TYPE)?.value ?? null,
    mustChangePassword: user.changePasswordAtNextLogin ?? false,
    signedInAt: signedInAt(user.lastLoginTime),
    raw,
  };
}

/** Google gives a user who never signed in the epoch as `lastLoginTime`. */
function signedInAt(lastLoginTime: string | undefined): Date | null {
  if (!lastLoginTime) return null;
  const at = new Date(lastLoginTime);
  return at.getTime() > 0 ? at : null;
}

/** The external ids that keep a `creationKey` on a new user. */
export function creationKeyIds(creationKey: string) {
  return [{ type: "custom", customType: CREATION_KEY_TYPE, value: creationKey }];
}

/** The external id type that holds a user's `creationKey`. */
const CREATION_KEY_TYPE = "broccoli_access_creation_key";

const DIRECTORY_USER = z.object({
  id: z.string(),
  primaryEmail: z.string(),
  name: z.object({
    givenName: z.string(),
    familyName: z.string(),
    fullName: z.string().optional(),
  }),
  isAdmin: z.boolean(),
  suspended: z.boolean(),
  relations: z.array(z.object({ type: z.string(), value: z.string() })).optional(),
  externalIds: z
    .array(z.object({ customType: z.string().optional(), value: z.string() }))
    .optional(),
  changePasswordAtNextLogin: z.boolean().optional(),
  lastLoginTime: z.string().optional(),
});
