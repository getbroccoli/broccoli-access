import { useState } from "react";
import { toast } from "sonner";

import {
  type AccountChangeAction,
  type AccountChangeCell_AppUserFragment,
  ChangeAccountDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
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

import { connectingFieldName } from "../connectingFieldName";

type Props = {
  user: AccountChangeCell_AppUserFragment;
  action: AccountChangeAction;
};

/**
 * Disable or Enable, confirmed in a dialog naming the person, the app and the workspace; the
 * dialog closes on confirm and the row then follows the change.
 */
export function ConfirmAccountChangeDialog({ user, action }: Props) {
  const [open, setOpen] = useState(false);
  const [changeAccount, { loading }] = usePayloadMutation(ChangeAccountDocument);
  const { employee, app } = user;
  const connector = app.containerConnection?.connector;
  const name = `${employee.firstName} ${employee.lastName}`;
  const copy = COPY[action];
  const confirm = async () => {
    setOpen(false);
    try {
      await changeAccount({ variables: { input: { id: user.id, action } } });
    } catch {
      toast.error(t("apps.change.refused", { name, app: app.name }));
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button type="button" variant="outline" size="sm" disabled={loading} />}
        aria-label={t(copy.label, { name, app: app.name })}
      >
        {t(copy.button)}
      </AlertDialogTrigger>
      <AlertDialogContent className="p-6 data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{t(copy.title, { name, app: app.name })}</AlertDialogTitle>
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
          <dt className="text-muted-foreground">{t("apps.change.app")}</dt>
          <dd className="flex items-center justify-end gap-2 font-medium">
            <AppMark name={app.name} catalogKey={app.catalogKey} className="size-6" />
            {app.name}
          </dd>
          <dt className="text-muted-foreground">{t("apps.change.workspace")}</dt>
          <dd className="text-right font-medium">
            {app.containerConnection?.scan?.sourceName ?? app.name}
          </dd>
        </dl>
        <AlertDialogDescription className="flex flex-col gap-3">
          <span>{t(copy.effect, { firstName: employee.firstName })}</span>
          {connector && (
            <span className="text-xs">
              {t("apps.change.howItWorks", {
                field: connectingFieldName(connector.connectionFields),
                app: app.name,
              })}
            </span>
          )}
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("apps.change.cancel")}</AlertDialogCancel>
          <AlertDialogAction type="button" onClick={() => void confirm()}>
            {t(copy.confirm, { app: app.name })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Disable's and Enable's words, which mirror each other. */
const COPY = {
  SUSPEND: {
    button: "apps.change.disable",
    label: "apps.change.disableName",
    title: "apps.change.disableTitle",
    effect: "apps.change.disableEffect",
    confirm: "apps.change.confirmDisable",
  },
  REACTIVATE: {
    button: "apps.change.enable",
    label: "apps.change.enableName",
    title: "apps.change.enableTitle",
    effect: "apps.change.enableEffect",
    confirm: "apps.change.confirmEnable",
  },
} as const;
