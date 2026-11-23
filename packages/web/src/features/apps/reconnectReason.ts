import type { AccountChangeAction, ReconnectCause } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { dayAndTime } from "@/lib/dayAndTime";

/** What a connection that needs reconnecting says about itself. */
export type ReconnectingConnection = {
  app: string;
  /** The typed key's name mid-sentence, such as "personal API key"; null for an app session. */
  keyName: string | null;
  /** The connection's user, from its last scan. */
  email: string | null;
  workspace: string | null;
};

/** Why the connection needs reconnecting, such as "Your Slack session expired or was signed out." */
export function reconnectCauseLine(
  cause: ReconnectCause,
  { app, keyName, email, workspace }: ReconnectingConnection,
): string {
  switch (cause) {
    case "AUTHENTICATION_FAILED":
      return keyName
        ? t("apps.reconnect.keyRefused", { app, field: keyName })
        : t("apps.reconnect.sessionExpired", { app });
    case "PERMISSION_MISSING":
      return email
        ? t("apps.reconnect.notAdmin", { app, email })
        : t("apps.reconnect.notAdminWithoutEmail", { app });
    case "WRONG_WORKSPACE":
      return keyName
        ? t("apps.reconnect.keyOtherWorkspace", { field: keyName, workspace: workspace ?? app })
        : t("apps.reconnect.sessionOtherWorkspace", { app, workspace: workspace ?? app });
  }
}

/** "Changes in Linear fail until you paste a new key." */
export function failsUntilLine({ app, keyName }: ReconnectingConnection): string {
  return t(keyName ? "apps.reconnect.failsUntilNewKey" : "apps.reconnect.failsUntilReconnect", {
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
  return t(
    action === "SUSPEND" ? "apps.reconnect.foundByDisable" : "apps.reconnect.foundByEnable",
    { name, when },
  );
}
