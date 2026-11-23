import type {
  AccountChangeAction,
  AccountChangeFailure,
  AccountChangeStatus,
  AppAccountStatus,
  ConnectionFieldKind,
} from "@/__generated__/graphql";
import { t } from "@/i18n";

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
  },
): string {
  return `${reasonOf(failure, about)} ${t("apps.couldnt.nothingChanged", { app: about.app })}`;
}

/**
 * What the owner may do about an account's failed latest change: try it again, say they made it by
 * hand, or scan the app. Try again needs the account to offer that change, as the server does (not
 * while its connection needs reconnecting); after `ACCOUNT_NOT_FOUND` it also needs a scan since the
 * failure, which may have read the member's new id, and Scan now is offered until it helps.
 */
export function failedChangeOptions({
  offeredChange,
  latestChange,
  app,
}: FailedChangeFacts): FailedChangeOptions {
  if (!latestChange?.failure || !latestChange.finishedAt) {
    return { tryAgain: false, byHand: false, scanNow: false };
  }
  const offered = offeredChange === latestChange.action;
  if (latestChange.failure === "NOT_ALLOWED") {
    return { tryAgain: false, byHand: true, scanNow: false };
  }
  if (latestChange.failure === "ACCOUNT_NOT_FOUND") {
    const lastScanAt = app.containerConnection?.scan?.readAt ?? null;
    const scannedSince =
      lastScanAt !== null && Date.parse(lastScanAt) > Date.parse(latestChange.finishedAt);
    const tryAgain = scannedSince && offered;
    return { tryAgain, byHand: false, scanNow: !tryAgain };
  }
  return { tryAgain: offered, byHand: true, scanNow: false };
}

/** What helps now, matching the options the dialog offers. */
export function couldntChangeHint(
  failure: AccountChangeFailure,
  action: AccountChangeAction,
  { tryAgain, scanNow }: FailedChangeOptions,
  { firstName, app }: { firstName: string; app: string },
): string {
  if (failure === "NOT_ALLOWED") {
    return t("apps.couldnt.hintByHandOnly", { app });
  }
  if (failure === "ACCOUNT_NOT_FOUND") {
    return t(scanNow ? "apps.couldnt.hintScan" : "apps.couldnt.hintScanned", { app });
  }
  const hints = action === "SUSPEND" ? DISABLE_HINTS : ENABLE_HINTS;
  return t(tryAgain ? hints.tryAgain : hints.byHand, { firstName, app });
}

/** Try again, say it was done by hand, or scan the app. */
export type FailedChangeOptions = { tryAgain: boolean; byHand: boolean; scanNow: boolean };

const DISABLE_HINTS = {
  tryAgain: "apps.couldnt.hintDisable",
  byHand: "apps.couldnt.hintDisableByHand",
} as const;

const ENABLE_HINTS = {
  tryAgain: "apps.couldnt.hintEnable",
  byHand: "apps.couldnt.hintEnableByHand",
} as const;

/** The parts of an app account its failed change's options are decided from. */
type FailedChangeFacts = {
  offeredChange?: AccountChangeAction | null;
  latestChange?: {
    action: AccountChangeAction;
    failure?: AccountChangeFailure | null;
    finishedAt?: string | null;
  } | null;
  app: { containerConnection?: { scan?: { readAt?: string | null } | null } | null };
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
      return t(withSession ? "apps.couldnt.sessionExpired" : "apps.couldnt.keyRefused", { app });
    case "PERMISSION_MISSING":
      return connectionUserEmail
        ? t("apps.couldnt.noLongerAdmin", { email: connectionUserEmail, app })
        : t("apps.couldnt.connectionNoLongerAdmin", { app });
    case "WRONG_WORKSPACE":
      return t(withSession ? "apps.couldnt.sessionElsewhere" : "apps.couldnt.keyElsewhere", {
        app,
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
