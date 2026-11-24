import { ArrowUpRight } from "@phosphor-icons/react";

import type { ConnectionsSettingsQuery } from "@/__generated__/graphql";
import { buttonVariants } from "@/components/ui/button";
import { t, type MessageKey } from "@/i18n";
import { cn } from "@/lib/class-names";

import type { IntegrationUserError } from "./connectionsSearch";
import { CreateIntegrationUserDialog } from "./CreateIntegrationUserDialog";
import { IntegrationUserMark } from "./IntegrationUserMark";

const FAILURE_MESSAGES: Record<IntegrationUserError, MessageKey> = {
  cancelled: "settings.integrationUser.cancelled",
  permission_refused: "settings.integrationUser.permissionRefused",
  email_taken: "settings.integrationUser.emailTaken",
  not_super_admin: "setup.connect.notSuperAdmin",
  other_workspace: "settings.googleApp.otherWorkspace",
  failed: "settings.integrationUser.failed",
};

type Props = {
  integrationUser: ConnectionsSettingsQuery["setup"]["integrationUser"];
  /** The workspace's domain, which the integration user's address is in. */
  domain: string;
  /** Whether the connection uses the instance's own Google app, which alone can ask to create users. */
  usesOwnGoogleApp: boolean;
  /** Why the last creation failed, from Google's redirect back. */
  failure: IntegrationUserError | undefined;
};

/** The integration user: what it is with the offer to create it, or the one created. */
export function IntegrationUserCard({ integrationUser, domain, usesOwnGoogleApp, failure }: Props) {
  if (integrationUser) {
    return (
      <article
        aria-labelledby="integration-user-title"
        className="flex flex-col gap-4 rounded-xl border border-border p-6 sm:flex-row sm:items-start"
      >
        <IntegrationUserMark />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <h3 id="integration-user-title" className="text-base font-semibold break-all">
            {integrationUser.email}
          </h3>
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-deep">
            {t("settings.integrationUser.created")}
          </span>
        </div>
        <a
          href="https://admin.google.com"
          target="_blank"
          rel="noreferrer"
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "shrink-0 gap-1.5 px-4",
          )}
        >
          {t("settings.integrationUser.openInGoogleAdmin")}
          <ArrowUpRight size={14} aria-hidden />
        </a>
      </article>
    );
  }
  return (
    <article
      aria-labelledby="integration-user-title"
      className="flex flex-col gap-4 rounded-xl border border-brand-soft bg-brand-soft/30 p-6 sm:flex-row sm:items-start"
    >
      <IntegrationUserMark />
      <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm text-foreground/80">
        <h3 id="integration-user-title" className="text-base font-semibold text-foreground">
          {t("settings.integrationUser.offerTitle")}
        </h3>
        <p>{t("settings.integrationUser.offerBody", { domain })}</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>{t("settings.integrationUser.offerBlocks")}</li>
          <li>{t("settings.integrationUser.offerKeepsWorking")}</li>
          <li>{t("settings.integrationUser.offerSuspend")}</li>
        </ul>
        {!usesOwnGoogleApp && <p>{t("settings.integrationUser.needsOwnGoogleApp")}</p>}
        {failure && (
          <p role="alert" className="text-destructive">
            {t(FAILURE_MESSAGES[failure])}
          </p>
        )}
      </div>
      {usesOwnGoogleApp && <CreateIntegrationUserDialog domain={domain} />}
    </article>
  );
}
