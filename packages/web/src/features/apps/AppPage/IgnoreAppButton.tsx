import { useState } from "react";

import type { AppPageQuery } from "@/__generated__/graphql";
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

type Props = {
  app: Pick<NonNullable<AppPageQuery["app"]>, "name" | "status" | "connected">;
  disabled: boolean;
  onIgnore: () => void;
};

/** Ignore, once a dialog confirms it, for an app not ignored; a connected app stays approved. */
export function IgnoreAppButton({ app, disabled, onIgnore }: Props) {
  const [open, setOpen] = useState(false);
  if (app.status === "IGNORED" || app.connected) {
    return null;
  }
  const confirm = () => {
    setOpen(false);
    onIgnore();
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button type="button" variant="outline" size="lg" disabled={disabled} />}
        aria-label={t("apps.ignoreApp", { name: app.name })}
      >
        {t("apps.ignore")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("apps.ignoreDialog.title", { name: app.name })}</AlertDialogTitle>
          <AlertDialogDescription>{t("apps.ignoreDialog.description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("apps.ignoreDialog.cancel")}</AlertDialogCancel>
          <AlertDialogAction type="button" onClick={confirm}>
            {t("apps.ignoreDialog.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
