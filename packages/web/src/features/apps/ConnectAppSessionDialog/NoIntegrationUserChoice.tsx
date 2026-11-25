import { Link } from "@tanstack/react-router";

import type { IntegrationUserSignInStatus } from "@/__generated__/graphql";
import { Button, buttonVariants } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";
import { t } from "@/i18n";

import { IntegrationUserTitle } from "./IntegrationUserTitle";

type Props = {
  signInStatus: IntegrationUserSignInStatus | undefined;
  /** Carries on with the owner's own session; left out when that is no choice. */
  onOwnSession?: () => void;
};

/** The ways to connect while no integration user can sign in: create or finish it, or the owner's own session. */
export function NoIntegrationUserChoice({ signInStatus, onOwnSession }: Props) {
  const exists = signInStatus !== undefined;
  const isSettingUp = signInStatus === "SETTING_UP_TWO_STEP_SIGN_IN";
  const description = isSettingUp
    ? "settings.integrationUser.settingUpSummary"
    : exists
      ? "settings.connectWay.notSetUp"
      : "settings.connectWay.none";
  return (
    <>
      <div className="flex flex-col gap-4 rounded-xl border border-brand-soft bg-brand-soft/30 px-4 py-3.5 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <IntegrationUserTitle />
          <p className="text-sm text-foreground/80">{t(description)}</p>
        </div>
        {!isSettingUp && (
          <DialogClose
            render={
              <Link
                to="/settings/google-workspace"
                className={buttonVariants({ size: "lg", className: "shrink-0 px-4" })}
              />
            }
          >
            {t(exists ? "settings.connectWay.openGoogleWorkspace" : "settings.connectWay.create")}
          </DialogClose>
        )}
      </div>
      {onOwnSession && (
        <div className="flex items-center gap-4 rounded-xl border border-border px-4 py-3.5">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-medium">{t("settings.connectWay.ownSession")}</span>
            <span className="text-sm text-muted-foreground">
              {t("settings.connectWay.needsExtension")}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="shrink-0 px-4"
            onClick={onOwnSession}
          >
            {t("settings.connectWay.continue")}
          </Button>
        </div>
      )}
    </>
  );
}
