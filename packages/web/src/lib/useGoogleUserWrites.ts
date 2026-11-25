import { useQuery } from "@apollo/client/react";
import { z } from "zod";

import { type AccountChangeFailure, GoogleUserWritesDocument } from "@/__generated__/graphql";

import { postJson } from "./postJson";

/** The catalog key of Google Workspace, whose accounts change only once Google allows it. */
export const GOOGLE_WORKSPACE = "google_workspace";

/** The next step depends on whether Google confirmed a refusal or returned no usable answer. */
export function directoryProvisionFailure(failure?: AccountChangeFailure | null) {
  switch (failure) {
    case "NOT_ALLOWED":
      return "people.add.emailExistsInGoogle";
    case "AUTHENTICATION_FAILED":
    case "PERMISSION_MISSING":
    case "WRONG_WORKSPACE":
      return "people.add.reconnectToCreate";
    default:
      return "people.add.notCreated";
  }
}

/**
 * Whether Broccoli Access may change the directory's users: `allowed`; `needs_consent`, since
 * setup's consent only reads and the first change sends the owner to Google once; or unknown
 * while `loading` or `failed`.
 */
export type GoogleUserWrites = "allowed" | "needs_consent" | "loading" | "failed";

export function useGoogleUserWrites(): GoogleUserWrites {
  const { data, error } = useQuery(GoogleUserWritesDocument);
  const google = data?.setup.googleWorkspace;
  if (!google) {
    return error ? "failed" : "loading";
  }
  return google.canChangeUsers ? "allowed" : "needs_consent";
}

/**
 * Sends the owner to Google's consent for changing users; Google's answer brings them back to
 * `returnTo`, a path of this app, with `googleUserWrites` saying how it ended. False when the
 * consent could not start.
 */
export async function askGoogleForUserWrites(returnTo: string): Promise<boolean> {
  try {
    const response = await postJson("/api/google/user-writes", { returnTo });
    if (!response.ok) {
      return false;
    }
    const { authorizationUrl } = (await response.json()) as { authorizationUrl: string };
    window.location.assign(authorizationUrl);
    return true;
  } catch {
    return false;
  }
}

/** How Google's consent for changing users ended, as `/api/google/callback` reports it. */
const GOOGLE_USER_WRITES_OUTCOMES = [
  "allowed",
  "cancelled",
  "permission_refused",
  "not_super_admin",
  "other_workspace",
  "failed",
] as const;

export type GoogleUserWritesOutcome = (typeof GOOGLE_USER_WRITES_OUTCOMES)[number];

/** The search param a page the owner returns to from that consent validates. */
export const googleUserWritesOutcome = z
  .enum(GOOGLE_USER_WRITES_OUTCOMES)
  .optional()
  .catch(undefined);
