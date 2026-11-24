import { ArrowUpRight } from "@phosphor-icons/react";

import {
  type ConnectionsSettingsQuery,
  type IntegrationUserSignInFailure,
  type IntegrationUserSignInStatus,
  SignInAsIntegrationUserDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button, buttonVariants } from "@/components/ui/button";
import { t, type MessageKey } from "@/i18n";
import { cn } from "@/lib/class-names";

import { IntegrationUserMark } from "./IntegrationUserMark";

const BADGES: Record<IntegrationUserSignInStatus, MessageKey> = {
  SETTING_UP_TWO_STEP_SIGN_IN: "settings.integrationUser.settingUp",
  SIGNS_IN_WITH_TWO_STEP_SIGN_IN: "settings.integrationUser.created",
  SIGN_IN_NEEDS_OWNER: "settings.integrationUser.needsYou",
};

const SUMMARIES: Record<Exclude<IntegrationUserSignInStatus, "SIGN_IN_NEEDS_OWNER">, MessageKey> = {
  SETTING_UP_TWO_STEP_SIGN_IN: "settings.integrationUser.settingUpSummary",
  SIGNS_IN_WITH_TWO_STEP_SIGN_IN: "settings.integrationUser.signedInSummary",
};

const FAILURE_MESSAGES: Record<IntegrationUserSignInFailure, MessageKey> = {
  BLOCKED_BY_CHECK: "settings.integrationUser.blockedByCheck",
  AUTHENTICATION_FAILED: "settings.integrationUser.authenticationFailed",
  CONNECTORS_CONTAINER_UNAVAILABLE: "settings.integrationUser.connectorsUnavailable",
  SETUP_DID_NOT_FINISH: "settings.integrationUser.setupDidNotFinish",
};

type Props = {
  integrationUser: NonNullable<ConnectionsSettingsQuery["setup"]["integrationUser"]>;
};

/** The created integration user: whether Broccoli Access signs in to Google as it, or why not. */
export function CreatedIntegrationUserCard({ integrationUser }: Props) {
  const [signIn, { loading: isStarting, error: startError }] = usePayloadMutation(
    SignInAsIntegrationUserDocument,
  );
  const { signInStatus, signInFailure } = integrationUser;
  const needsOwner = signInStatus === "SIGN_IN_NEEDS_OWNER";

  return (
    <article
      aria-labelledby="integration-user-title"
      className={cn(
        "flex flex-col gap-4 rounded-xl border p-6 sm:flex-row sm:items-start",
        needsOwner ? "border-amber-200 bg-amber-50/60" : "border-border",
      )}
    >
      <IntegrationUserMark />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="integration-user-title" className="text-base font-semibold break-all">
            {integrationUser.email}
          </h3>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              signInStatus === "SIGNS_IN_WITH_TWO_STEP_SIGN_IN" && "bg-brand-soft text-brand-deep",
              signInStatus === "SETTING_UP_TWO_STEP_SIGN_IN" && "bg-muted text-muted-foreground",
              needsOwner && "bg-amber-100 text-amber-900",
            )}
          >
            {t(BADGES[signInStatus])}
          </span>
        </div>
        <p className="text-sm text-foreground/80" aria-live="polite">
          {needsOwner
            ? t(FAILURE_MESSAGES[signInFailure ?? "SETUP_DID_NOT_FINISH"])
            : t(SUMMARIES[signInStatus])}
        </p>
        {startError && (
          <p role="alert" className="text-sm text-destructive">
            {t("settings.integrationUser.tryAgainFailed")}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {needsOwner && (
          <Button
            type="button"
            size="lg"
            className="px-4"
            disabled={isStarting}
            // `usePayloadMutation` keeps the failure for display.
            onClick={() => void signIn().catch(() => undefined)}
          >
            {t("settings.integrationUser.tryAgain")}
          </Button>
        )}
        <a
          href="https://admin.google.com"
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-1.5 px-4")}
        >
          {t("settings.integrationUser.openInGoogleAdmin")}
          <ArrowUpRight size={14} aria-hidden />
        </a>
      </div>
    </article>
  );
}
