import type { MessageKey } from "@/i18n";

/** Why signing in stopped, with what the owner does about it; undefined while it runs or once it is done. */
export function failureOf(
  payloadError: { __typename: string; fields?: { field: string; code: string }[] } | null,
  failedOtherwise: boolean,
): MessageKey | undefined {
  const code = payloadError?.fields?.find(({ field }) => field === "integrationUser")?.code;
  if (code && code in FAILURES) {
    return FAILURES[code];
  }
  return payloadError || failedOtherwise ? "settings.integrationUserConnect.failed" : undefined;
}

/** The sign-in failures the owner can put right, by the API's code. */
const FAILURES: Partial<Record<string, MessageKey>> = {
  not_invited: "settings.integrationUserConnect.notInvited",
  permission_missing: "settings.integrationUserConnect.notAdmin",
  blocked_by_check: "settings.integrationUserConnect.blockedByCheck",
  authentication_failed: "settings.integrationUserConnect.authenticationFailed",
  wrong_workspace: "settings.integrationUserConnect.otherWorkspace",
  not_set_up: "settings.integrationUserConnect.notSetUp",
  scan_running: "settings.integrationUserConnect.scanRunning",
};
