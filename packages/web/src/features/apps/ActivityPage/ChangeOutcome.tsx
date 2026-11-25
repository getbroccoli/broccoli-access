import { Check } from "@phosphor-icons/react";

import type { FragmentType } from "@apollo/client";

import type {
  AccountChangeAction,
  AccountChangeFailure,
  CouldntChangeDialog_AccountChangeFragment,
} from "@/__generated__/graphql";
import { type MessageKey, t } from "@/i18n";
import { dayAndTime } from "@/lib/dayAndTime";
import { directoryProvisionFailure } from "@/lib/useGoogleUserWrites";

import { ChangeProgress, CouldntChangeDialog } from "../AccountChangeCell";
import { type AccountChangeRow, createsDirectoryAccount } from "./accountChangeRow";

type Props = {
  change: Pick<
    AccountChangeRow,
    "action" | "status" | "changesAhead" | "failure" | "finishedAt" | "app"
  > &
    FragmentType<CouldntChangeDialog_AccountChangeFragment>;
};

/**
 * How a change ended: on the server, by hand after a failure, or not at all with its reason, which
 * opens why it failed; or its progress.
 */
export function ChangeOutcome({ change }: Props) {
  const { status, app } = change;
  if (status === "RUNNING") {
    if (createsDirectoryAccount(change)) return <span>{t("people.add.creating")}</span>;
    return (
      <div className="w-fit">
        <ChangeProgress app={app.name} change={change} />
      </div>
    );
  }
  if (status === "SUCCEEDED") {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium whitespace-nowrap text-brand-deep">
        <Check size={16} weight="bold" aria-hidden />
        {t("apps.activity.onServer")}
      </span>
    );
  }
  if (status === "DONE_BY_HAND") {
    return (
      <span className="flex flex-col whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground/80">
          <Check size={16} aria-hidden />
          {t("apps.activity.byHand")}
        </span>
        <span className="text-xs text-muted-foreground">{byHandNote(change.finishedAt)}</span>
      </span>
    );
  }
  if (createsDirectoryAccount(change)) {
    return (
      <span className="text-sm text-destructive">
        {t(directoryProvisionFailure(change.failure))}
      </span>
    );
  }
  return (
    <span className="flex flex-col items-start gap-1 whitespace-nowrap">
      <CouldntChangeDialog change={change} triggerClassName={FAILED} />
      {change.failure && (
        <span className="text-xs text-muted-foreground">
          {t(reasonKey(change.action, change.failure), { app: app.name })}
        </span>
      )}
    </span>
  );
}

/** The failed outcome, opening why. */
const FAILED =
  "inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 text-[13px] font-semibold text-red-800 transition-colors hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** What the owner can do about each failure, which the row names under "Couldn't …". */
const REASONS: Record<AccountChangeFailure, MessageKey> = {
  AUTHENTICATION_FAILED: "apps.activity.reason.reconnect",
  PERMISSION_MISSING: "apps.activity.reason.reconnect",
  WRONG_WORKSPACE: "apps.activity.reason.reconnect",
  RATE_LIMITED: "apps.activity.reason.tryLater",
  APP_UNAVAILABLE: "apps.activity.reason.tryLater",
  UNEXPECTED_RESPONSE: "apps.activity.reason.tryLater",
  BLOCKED_BY_CHECK: "apps.activity.reason.securityCheck",
  OWNER_BROWSER_LOST: "apps.activity.reason.tryLater",
  ACCOUNT_NOT_FOUND: "apps.activity.reason.scanNow",
  NOT_ALLOWED: "apps.activity.reason.notAllowed",
  NO_CONNECTION: "apps.activity.reason.noConnection",
};

/** Broccoli Access itself refuses a Remove whose member is active again, so the app is not named. */
function reasonKey(action: AccountChangeAction, failure: AccountChangeFailure): MessageKey {
  return action === "REMOVE" && failure === "NOT_ALLOWED"
    ? "apps.activity.reason.removeRefused"
    : REASONS[failure];
}

function byHandNote(finishedAt: string | null): string {
  if (finishedAt === null) {
    return "";
  }
  const { day, time } = dayAndTime(finishedAt);
  return day === null
    ? t("apps.activity.byHandToday", { time })
    : t("apps.activity.byHandOn", { day, time });
}
