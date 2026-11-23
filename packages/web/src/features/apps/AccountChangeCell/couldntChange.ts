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

/** What the owner may do about a failed change: try it again, say they made it by hand, or scan the app. */
export function couldntChangeOptions(
  failure: AccountChangeFailure,
  { failedAt, lastScanAt }: { failedAt: string; lastScanAt: string | null },
): { tryAgain: boolean; byHand: boolean; scanNow: boolean } {
  if (failure === "NOT_ALLOWED") {
    return { tryAgain: false, byHand: true, scanNow: false };
  }
  if (failure === "ACCOUNT_NOT_FOUND") {
    // A scan since the failure may have read the member's new id, so trying again can help.
    const scannedSince = lastScanAt !== null && Date.parse(lastScanAt) > Date.parse(failedAt);
    return { tryAgain: scannedSince, byHand: false, scanNow: !scannedSince };
  }
  return { tryAgain: true, byHand: true, scanNow: false };
}

/**
 * What the owner may do about an account's failed latest change; Try again only while the account
 * offers that change, which the server requires (not while its connection needs reconnecting).
 */
export function failedChangeOptions({
  offeredChange,
  latestChange,
  app,
}: FailedChangeFacts): ReturnType<typeof couldntChangeOptions> {
  if (!latestChange?.failure || !latestChange.finishedAt) {
    return { tryAgain: false, byHand: false, scanNow: false };
  }
  const options = couldntChangeOptions(latestChange.failure, {
    failedAt: latestChange.finishedAt,
    lastScanAt: app.containerConnection?.scan?.readAt ?? null,
  });
  const tryAgain = options.tryAgain && offeredChange === latestChange.action;
  // A scan since the member went missing that still lists no single member for the account helps
  // only when run again, once the member is fixed in the app.
  const scanAgain = latestChange.failure === "ACCOUNT_NOT_FOUND" && !tryAgain;
  return { ...options, tryAgain, scanNow: options.scanNow || scanAgain };
}

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
