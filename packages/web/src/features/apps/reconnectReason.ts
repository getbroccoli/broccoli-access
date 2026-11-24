import type { AccountChangeAction, ReconnectCause } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { dayAndTime } from "@/lib/dayAndTime";

/** What a connection that needs reconnecting says about itself. */
type ReconnectingConnection = {
  app: string;
  /** Whether it connects with the owner's app session; otherwise with a typed key. */
  withSession: boolean;
  /** The connection's user, from its last scan; null before one. */
  email: string | null;
  workspace: string;
};

/**
 * Why a connection needs reconnecting, such as "Your Slack session expired or was signed out.";
 * a change that failed for that cause says the same.
 */
export function reconnectCauseLine(
  cause: ReconnectCause,
  { app, withSession, email, workspace }: ReconnectingConnection,
): string {
  switch (cause) {
    case "AUTHENTICATION_FAILED":
      return t(withSession ? "apps.couldnt.sessionExpired" : "apps.couldnt.keyRefused", { app });
    case "PERMISSION_MISSING":
      return email
        ? t("apps.couldnt.noLongerAdmin", { email, app })
        : t("apps.couldnt.connectionNoLongerAdmin", { app });
    case "WRONG_WORKSPACE":
      return t(withSession ? "apps.couldnt.sessionElsewhere" : "apps.couldnt.keyElsewhere", {
        app,
        workspace,
      });
  }
}

/** "Changes in Linear fail until you paste a new key." */
export function failsUntilLine({
  app,
  withSession,
}: Pick<ReconnectingConnection, "app" | "withSession">): string {
  return t(withSession ? "apps.reconnect.failsUntilReconnect" : "apps.reconnect.failsUntilNewKey", {
    app,
  });
}

/** What found it: "Found by a scan today at 11:02." or "Found when you disabled Ana Ruiz today at 10:05." */
export function foundLine({
  foundAt,
  foundByChange,
}: {
  foundAt: string;
  foundByChange: {
    action: AccountChangeAction;
    email: string;
    employee: { firstName: string; lastName: string } | null;
  } | null;
}): string {
  const { day, time } = dayAndTime(foundAt);
  const when = day ? t("apps.reconnect.onDay", { day, time }) : t("apps.reconnect.today", { time });
  if (!foundByChange) {
    return t("apps.reconnect.foundByScan", { when });
  }
  const { employee, email, action } = foundByChange;
  const name = employee ? `${employee.firstName} ${employee.lastName}` : email;
  return t(FOUND_BY[action], { name, when });
}

const FOUND_BY = {
  SUSPEND: "apps.reconnect.foundByDisable",
  REACTIVATE: "apps.reconnect.foundByEnable",
  INVITE: "apps.reconnect.foundByInvite",
} as const;
