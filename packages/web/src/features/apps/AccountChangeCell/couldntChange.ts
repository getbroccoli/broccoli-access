import type {
  AccountChangeAction,
  AccountChangeFailure,
  AccountChangeStatus,
  AppAccountStatus,
  ConnectionFieldKind,
} from "@/__generated__/graphql";
import { t } from "@/i18n";

import { reconnectCauseLine } from "../reconnectReason";

/**
 * Whether an account shows "Couldn't disable" or "Couldn't enable": its latest change failed, and
 * its status is not yet what that change asked for, which a scan since may have read.
 */
export function showsCouldntChange({
  status,
  latestChange,
}: {
  status: AppAccountStatus;
  latestChange?: { status: AccountChangeStatus; action: AccountChangeAction } | null;
}): boolean {
  if (latestChange?.status !== "FAILED") {
    return false;
  }
  return status !== (latestChange.action === "SUSPEND" ? "SUSPENDED" : "ACTIVE");
}

/** Why a failed change could not be made, as the "Couldn't" dialog says it, ending with "Nothing changed in <app>." */
export function couldntChangeReason(
  failure: AccountChangeFailure,
  about: {
    app: string;
    workspace: string;
    person: { name: string; email: string };
    /** The member whose key or session the connection uses; null before a scan read it. */
    connectionUserEmail: string | null;
    /** The kind of the connector's secret field: an API key (`TEXT`) or the owner's app session. */
    credential: ConnectionFieldKind;
    /** Whether the connection needs reconnecting before the change can run again. */
    toReconnect: boolean;
  },
): string {
  const { app, credential, toReconnect } = about;
  const reconnect = toReconnect
    ? ` ${t(credential === "APP_SESSION" ? "apps.couldnt.reconnectSession" : "apps.couldnt.reconnectKey", { app })}`
    : "";
  return `${reasonOf(failure, about)}${reconnect} ${t("apps.couldnt.nothingChanged", { app })}`;
}

/**
 * What the owner may do about an account's failed latest change: try it again, say they made it by
 * hand, scan the app, or reconnect it. Try again needs the account to offer that change, as the
 * server does (not while its connection needs reconnecting); after `ACCOUNT_NOT_FOUND` it also needs
 * a scan since the failure, which may have read the member's new id, and Scan now is offered until
 * it helps. Reconnect is offered after a failure that turned the connection to Reconnect, or after
 * `ACCOUNT_NOT_FOUND` in place of Scan now, while the connection needs it.
 */
export function failedChangeOptions({
  offeredChange,
  latestChange,
  app,
}: FailedChangeFacts): FailedChangeOptions {
  if (!latestChange?.failure || !latestChange.finishedAt) {
    return { tryAgain: false, byHand: false, scanNow: false, reconnect: false };
  }
  const offered = offeredChange === latestChange.action;
  if (latestChange.failure === "NOT_ALLOWED") {
    return { tryAgain: false, byHand: true, scanNow: false, reconnect: false };
  }
  const needsReconnect = app.containerConnection?.status === "RECONNECT";
  if (latestChange.failure === "ACCOUNT_NOT_FOUND") {
    // Reconnecting queues the scan that may find the member, so it replaces Scan now.
    if (needsReconnect) {
      return { tryAgain: false, byHand: false, scanNow: false, reconnect: true };
    }
    const lastScanAt = app.containerConnection?.scan?.readAt ?? null;
    const scannedSince =
      lastScanAt !== null && Date.parse(lastScanAt) > Date.parse(latestChange.finishedAt);
    const tryAgain = scannedSince && offered;
    return { tryAgain, byHand: false, scanNow: !tryAgain, reconnect: false };
  }
  const reconnect = RECONNECT_FAILURES.includes(latestChange.failure) && needsReconnect;
  return { tryAgain: offered && !reconnect, byHand: true, scanNow: false, reconnect };
}

/** What helps now, matching the options the dialog offers. */
export function couldntChangeHint(
  failure: AccountChangeFailure,
  action: AccountChangeAction,
  { tryAgain, scanNow, reconnect }: FailedChangeOptions,
  { firstName, app }: { firstName: string; app: string },
): string {
  if (failure === "NOT_ALLOWED") {
    return t("apps.couldnt.hintByHandOnly", { app });
  }
  if (failure === "ACCOUNT_NOT_FOUND") {
    if (reconnect) {
      return t("apps.couldnt.hintScanAfterReconnect", { app });
    }
    return t(scanNow ? "apps.couldnt.hintScan" : "apps.couldnt.hintScanned", { app });
  }
  const hints = action === "SUSPEND" ? DISABLE_HINTS : ENABLE_HINTS;
  if (reconnect) {
    return t(hints.reconnect, { firstName, app });
  }
  return t(tryAgain ? hints.tryAgain : hints.byHand, { firstName, app });
}

/** Try again, say it was done by hand, scan the app, or reconnect it. */
export type FailedChangeOptions = {
  tryAgain: boolean;
  byHand: boolean;
  scanNow: boolean;
  reconnect: boolean;
};

/** The failures that turn a connection to Reconnect. */
const RECONNECT_FAILURES: readonly AccountChangeFailure[] = [
  "AUTHENTICATION_FAILED",
  "PERMISSION_MISSING",
  "WRONG_WORKSPACE",
];

const DISABLE_HINTS = {
  tryAgain: "apps.couldnt.hintDisable",
  byHand: "apps.couldnt.hintDisableByHand",
  reconnect: "apps.couldnt.hintDisableAfterReconnect",
} as const;

const ENABLE_HINTS = {
  tryAgain: "apps.couldnt.hintEnable",
  byHand: "apps.couldnt.hintEnableByHand",
  reconnect: "apps.couldnt.hintEnableAfterReconnect",
} as const;

/** The parts of an app account its failed change's options are decided from. */
type FailedChangeFacts = {
  offeredChange?: AccountChangeAction | null;
  latestChange?: {
    action: AccountChangeAction;
    failure?: AccountChangeFailure | null;
    finishedAt?: string | null;
  } | null;
  app: {
    containerConnection?: {
      status?: "CONNECTED" | "RECONNECT";
      scan?: { readAt?: string | null } | null;
    } | null;
  };
};

function reasonOf(
  failure: AccountChangeFailure,
  {
    app,
    workspace,
    person,
    connectionUserEmail,
    credential,
  }: Parameters<typeof couldntChangeReason>[1],
): string {
  const withSession = credential === "APP_SESSION";
  switch (failure) {
    case "UNEXPECTED_RESPONSE":
      return t("apps.couldnt.unexpectedResponse", { app });
    case "BLOCKED_BY_CHECK":
      return t("apps.couldnt.blockedByCheck", { app });
    case "RATE_LIMITED":
    case "APP_UNAVAILABLE":
      return t("apps.couldnt.noAnswer", { app });
    case "AUTHENTICATION_FAILED":
    case "PERMISSION_MISSING":
    case "WRONG_WORKSPACE":
      return reconnectCauseLine(failure, {
        app,
        withSession,
        email: connectionUserEmail,
        workspace,
      });
    case "ACCOUNT_NOT_FOUND":
      return t("apps.couldnt.accountNotFound", { app, name: person.name, email: person.email });
    case "NOT_ALLOWED":
      return t("apps.couldnt.notAllowed", { app });
    case "OWNER_BROWSER_LOST":
      return t("apps.couldnt.browserLost", { app });
  }
}
