import { useState } from "react";
import { toast } from "sonner";

import type {
  AccountChangeAction,
  AccountChangeCell_AppUserFragment,
  InviteCell_AppInviteFragment,
} from "@/__generated__/graphql";
import { AppMark } from "@/components/AppMark";
import { Avatar } from "@/components/Avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import {
  askGoogleForUserWrites,
  GOOGLE_WORKSPACE,
  useGoogleUserWrites,
} from "@/lib/useGoogleUserWrites";

import { accountChangeActor } from "./accountChangeActor";
import { changeTargetOf, useChangeAccount } from "./useChangeAccount";

type Props = {
  /** The account for Disable and Enable, or the employee's invite row for Invite. */
  row: Pick<
    AccountChangeCell_AppUserFragment | InviteCell_AppInviteFragment,
    "id" | "employee" | "app"
  >;
  accountEmail?: string;
  expectedRole?: string;
  onlyIfExtra?: boolean;
  action: Exclude<AccountChangeAction, "REMOVE">;
};

/**
 * Disable, Enable or Invite, confirmed in a dialog naming the person, the app and the workspace;
 * the dialog closes on confirm and the row then follows the change.
 */
export function ConfirmAccountChangeDialog({
  row,
  action,
  accountEmail,
  expectedRole,
  onlyIfExtra,
}: Props) {
  const [open, setOpen] = useState(false);
  const { changeAccount, loading } = useChangeAccount();
  const { employee, app } = row;
  const actor = accountChangeActor(app);
  const name = `${employee.firstName} ${employee.lastName}`;
  const copy = COPY[action];
  const howItWorks =
    action === "INVITE" && app.containerConnection?.sessionFrom === "SERVER_SIGN_IN"
      ? "apps.change.howInviteAsIntegrationUserWorks"
      : copy.howItWorks;
  const google = useGoogleUserWrites();
  // Setup's consent only reads: the first change of a Google account goes through Google's
  // consent, and the owner asks again once back.
  const isGoogle = app.catalogKey === GOOGLE_WORKSPACE;
  const asksGoogle = isGoogle && google === "needs_consent";
  // Never asked for while Google's permission is unknown, or cannot be asked for.
  const blocked = isGoogle && google !== "allowed" && !asksGoogle;
  const confirm = async () => {
    setOpen(false);
    if (!asksGoogle) {
      await changeAccount(changeTargetOf(row, action, onlyIfExtra), action);
    } else if (
      !(await askGoogleForUserWrites(
        onlyIfExtra ? "/people?view=differences" : window.location.pathname,
      ))
    ) {
      toast.error(t("apps.change.googleStartFailed"));
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button type="button" variant="outline" size="sm" disabled={loading} />}
        aria-label={t(copy.label, { name: accountEmail ?? name, app: app.name })}
      >
        {t(copy.button)}
      </AlertDialogTrigger>
      <AlertDialogContent className="p-6 data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(copy.title, { name: accountEmail ?? name, app: app.name })}
          </AlertDialogTitle>
        </AlertDialogHeader>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 rounded-xl border border-border px-4 py-3 text-sm">
          <dt className="text-muted-foreground">{t("apps.change.person")}</dt>
          <dd className="flex min-w-0 items-center justify-end gap-2">
            <Avatar
              url={employee.avatarUrl ?? null}
              firstName={employee.firstName}
              lastName={employee.lastName}
              className="size-6 text-[10px]"
            />
            <span className="truncate">
              <span className="font-medium">{name}</span>{" "}
              <span className="text-muted-foreground">{employee.email}</span>
            </span>
          </dd>
          {accountEmail && accountEmail !== employee.email && (
            <>
              <dt className="text-muted-foreground">{t("apps.page.account")}</dt>
              <dd className="text-right font-medium">{accountEmail}</dd>
            </>
          )}
          <dt className="text-muted-foreground">{t("apps.change.app")}</dt>
          <dd className="flex items-center justify-end gap-2 font-medium">
            <AppMark name={app.name} catalogKey={app.catalogKey} className="size-6" />
            {app.name}
          </dd>
          {expectedRole && (
            <>
              <dt className="text-muted-foreground">{t("templates.role.expected")}</dt>
              <dd className="text-right font-medium">{expectedRole}</dd>
            </>
          )}
          <dt className="text-muted-foreground">{t("apps.change.workspace")}</dt>
          <dd className="text-right font-medium">
            {app.containerConnection?.scan?.sourceName ?? app.name}
          </dd>
        </dl>
        <AlertDialogDescription className="flex flex-col gap-3">
          <span>{t(copy.effect, { firstName: employee.firstName, app: app.name })}</span>
          {asksGoogle && <span>{t("apps.change.googleAsks")}</span>}
          {blocked && google === "unsupported" && <span>{t("apps.change.googleNeedsOwnApp")}</span>}
          {blocked && google === "failed" && <span>{t("apps.change.googleCheckFailed")}</span>}
          {actor && <span className="text-xs">{t(howItWorks, { actor, app: app.name })}</span>}
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("apps.change.cancel")}</AlertDialogCancel>
          <AlertDialogAction type="button" disabled={blocked} onClick={() => void confirm()}>
            {asksGoogle ? t("apps.change.continueToGoogle") : t(copy.confirm, { app: app.name })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Disable's, Enable's and Invite's words, which mirror each other. */
const COPY = {
  SUSPEND: {
    button: "apps.change.disable",
    label: "apps.change.disableName",
    title: "apps.change.disableTitle",
    effect: "apps.change.disableEffect",
    howItWorks: "apps.change.howItWorks",
    confirm: "apps.change.confirmDisable",
  },
  REACTIVATE: {
    button: "apps.change.enable",
    label: "apps.change.enableName",
    title: "apps.change.enableTitle",
    effect: "apps.change.enableEffect",
    howItWorks: "apps.change.howItWorks",
    confirm: "apps.change.confirmEnable",
  },
  INVITE: {
    button: "apps.change.invite",
    label: "apps.change.inviteName",
    title: "apps.change.inviteTitle",
    effect: "apps.change.inviteEffect",
    howItWorks: "apps.change.howInviteWorks",
    confirm: "apps.change.confirmInvite",
  },
} as const;
