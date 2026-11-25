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
 * Whether an account shows "Couldn't disable", "Couldn't enable" or "Couldn't remove": its latest
 * change failed, and its status is not yet what that change asked for, which a scan since may have
 * read; a failed Remove shows while the account is still disabled.
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
  // A member a scan read active again is not removable, so nothing is left to say.
  if (latestChange.action === "REMOVE") return status === "SUSPENDED";
  return status !== (latestChange.action === "SUSPEND" ? "SUSPENDED" : "ACTIVE");
}

/** Why a failed change could not be made, as the "Couldn't" dialog says it, ending with "Nothing changed in <app>." */
export function couldntChangeReason(
  failure: AccountChangeFailure,
  about: {
    action?: AccountChangeAction;
    historical?: boolean;
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
  // A refusal changed nothing; any other failed Remove may have removed the member unseen.
  const unconfirmed = about.action === "REMOVE" && failure !== "NOT_ALLOWED";
  return `${reasonOf(failure, about)}${reconnect} ${t(unconfirmed ? "apps.couldnt.unconfirmedRemoval" : "apps.couldnt.nothingChanged", { app })}`;
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
  offersRemove,
  latestChange,
  app,
}: FailedChangeFacts): FailedChangeOptions {
  if (!latestChange?.failure || !latestChange.finishedAt) {
    return { tryAgain: false, byHand: false, scanNow: false, reconnect: false };
  }
  const offered =
    latestChange.action === "REMOVE"
      ? offersRemove === true
      : offeredChange === latestChange.action;
  if (latestChange.failure === "NOT_ALLOWED") {
    return { tryAgain: false, byHand: true, scanNow: false, reconnect: false };
  }
  const needsReconnect = app.containerConnection?.status === "RECONNECT";
  if (latestChange.failure === "ACCOUNT_NOT_FOUND") {
    // Reconnecting queues the scan that may find the member, so it replaces Scan now.
    if (needsReconnect) {
      return { tryAgain: false, byHand: false, scanNow: false, reconnect: true };
    }
    const tryAgain = scannedSince(app, latestChange.finishedAt) && offered;
    return { tryAgain, byHand: false, scanNow: !tryAgain, reconnect: false };
  }
  const reconnect = RECONNECT_FAILURES.includes(latestChange.failure) && needsReconnect;
  return { tryAgain: offered && !reconnect, byHand: true, scanNow: false, reconnect };
}

/** Whether the connection's last scan was read after the change ended. */
function scannedSince(app: FailedChangeFacts["app"], finishedAt: string): boolean {
  const lastScanAt = app.containerConnection?.scan?.readAt ?? null;
  return lastScanAt !== null && Date.parse(lastScanAt) > Date.parse(finishedAt);
}

/**
 * Whether the row offers Remove with a new confirmation: as the server offers it, unless the row
 * shows a failed Remove. After a refusal it is back once a scan since read the member still
 * disabled; the other failures offer Try again.
 */
export function offersFreshRemove({
  status,
  offersRemove,
  latestChange,
  app,
}: Pick<FailedChangeFacts, "app"> & {
  status: AppAccountStatus;
  offersRemove: boolean;
  latestChange?:
    (NonNullable<FailedChangeFacts["latestChange"]> & { status: AccountChangeStatus }) | null;
}): boolean {
  if (!offersRemove) return false;
  if (latestChange?.action !== "REMOVE" || !showsCouldntChange({ status, latestChange })) {
    return true;
  }
  return (
    latestChange.failure === "NOT_ALLOWED" &&
    latestChange.finishedAt != null &&
    scannedSince(app, latestChange.finishedAt)
  );
}

/** What helps now, matching the options the dialog offers. */
export function couldntChangeHint(
  failure: AccountChangeFailure,
  action: AccountChangeAction,
  { tryAgain, scanNow, reconnect }: FailedChangeOptions,
  { firstName, app, roleConflict }: { firstName: string; app: string; roleConflict?: boolean },
): string {
  if (failure === "NOT_ALLOWED") {
    // Broccoli Access itself refuses a Remove whose member a scan saw active again.
    if (action === "REMOVE") return t("apps.couldnt.hintRemoveRefused", { firstName, app });
    return t("apps.couldnt.hintByHandOnly", { app });
  }
  if (failure === "ACCOUNT_NOT_FOUND") {
    if (reconnect) {
      return t("apps.couldnt.hintScanAfterReconnect", { app });
    }
    return t(scanNow ? "apps.couldnt.hintScan" : "apps.couldnt.hintScanned", { app });
  }
  const hints = HINTS[action];
  if (reconnect) {
    if (action === "INVITE" && roleConflict) return t("apps.couldnt.hintInviteRole", { app });
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

const INVITE_HINTS = {
  tryAgain: "apps.couldnt.hintInvite",
  byHand: "apps.couldnt.hintInviteByHand",
  reconnect: "apps.couldnt.hintInviteAfterReconnect",
} as const;

const HINTS = {
  REMOVE: {
    tryAgain: "apps.couldnt.hintRemove",
    byHand: "apps.couldnt.hintRemoveByHand",
    reconnect: "apps.couldnt.hintRemoveAfterReconnect",
  },
  SUSPEND: DISABLE_HINTS,
  REACTIVATE: ENABLE_HINTS,
  INVITE: INVITE_HINTS,
} as const;

/** The parts of an app account its failed change's options are decided from. */
type FailedChangeFacts = {
  offersRemove?: boolean;
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
    action,
    app,
    workspace,
    person,
    connectionUserEmail,
    credential,
    historical,
  }: Parameters<typeof couldntChangeReason>[1],
): string {
  const withSession = credential === "APP_SESSION";
  switch (failure) {
    case "UNEXPECTED_RESPONSE":
      return t("apps.couldnt.unexpectedResponse", { app });
    case "BLOCKED_BY_CHECK":
      return t("apps.couldnt.blockedByCheck", { app });
    case "APP_UNAVAILABLE":
      if (action === "INVITE")
        return t(
          historical ? "apps.couldnt.inviteWasUnavailable" : "apps.couldnt.inviteUnavailable",
          { app },
        );
      return t("apps.couldnt.noAnswer", { app });
    case "RATE_LIMITED":
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
      return t(action === "REMOVE" ? "apps.couldnt.removeNotAllowed" : "apps.couldnt.notAllowed", {
        app,
      });
    case "OWNER_BROWSER_LOST":
      return t("apps.couldnt.browserLost", { app });
  }
}
