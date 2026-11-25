import type {
  AccountChangeAction,
  AppSessionSource,
  ReconnectCause,
} from "@/__generated__/graphql";
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
  /** Set for a connection that signs in as the integration user, with whether Google suspended it. */
  integrationUser?: { suspended: boolean } | null;
};

/** Who a connection signs in as, for the words about its Reconnect: the integration user, or null for the owner's own. */
export function integrationUserOf(connection: {
  sessionFrom?: AppSessionSource | null;
  integrationUserSuspended: boolean;
}): ReconnectingConnection["integrationUser"] {
  return connection.sessionFrom === "SERVER_SIGN_IN"
    ? { suspended: connection.integrationUserSuspended }
    : null;
}

/**
 * Why a connection needs reconnecting, such as "Your Slack session expired or was signed out.";
 * a change that failed for that cause says the same.
 */
export function reconnectCauseLine(
  cause: ReconnectCause,
  { app, withSession, email, workspace, integrationUser }: ReconnectingConnection,
): string {
  if (integrationUser) {
    return integrationUserCauseLine(cause, {
      app,
      workspace,
      suspended: integrationUser.suspended,
    });
  }
  switch (cause) {
    case "BLOCKED_BY_CHECK":
      return t("apps.couldnt.blockedByCheck", { app });
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

/** Why the integration user's connection needs reconnecting: it names the integration user and the reason. */
function integrationUserCauseLine(
  cause: ReconnectCause,
  { app, workspace, suspended }: { app: string; workspace: string; suspended: boolean },
): string {
  switch (cause) {
    case "AUTHENTICATION_FAILED":
      return t(
        suspended ? "apps.couldnt.integrationUserSuspended" : "apps.couldnt.integrationUserRefused",
        { app },
      );
    case "PERMISSION_MISSING":
      return t("apps.couldnt.integrationUserNotAdmin", { app });
    case "BLOCKED_BY_CHECK":
      return t("apps.couldnt.integrationUserCheck", { app });
    case "WRONG_WORKSPACE":
      return t("apps.couldnt.integrationUserElsewhere", { workspace });
  }
}

/** "Changes in Linear fail until you paste a new key." */
export function failsUntilLine({
  app,
  withSession,
  integrationUser,
}: Pick<ReconnectingConnection, "app" | "withSession" | "integrationUser">): string {
  if (integrationUser) {
    return t("apps.reconnect.failsUntilIntegrationUser", { app });
  }
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
  REMOVE: "apps.reconnect.foundByRemove",
  INVITE: "apps.reconnect.foundByInvite",
} as const;
