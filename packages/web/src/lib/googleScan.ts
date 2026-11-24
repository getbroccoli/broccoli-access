import type { ScanFailure } from "@/__generated__/graphql";

/** Consent renews revoked access and missing Google permissions; other failures need a retry. */
export function needsGoogleReconnect(failure: ScanFailure | null | undefined): boolean {
  return failure === "AUTHENTICATION_FAILED" || failure === "PERMISSION_MISSING";
}
