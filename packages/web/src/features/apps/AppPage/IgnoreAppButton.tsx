import { useState } from "react";
import { toast } from "sonner";

import { type AppPageQuery, IgnoreAppDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
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

import { forgetAppLists } from "../cache";

type Props = {
  app: Pick<NonNullable<AppPageQuery["app"]>, "id" | "name" | "status" | "connected">;
};

/** Ignore, once a dialog confirms it, for an app not ignored; a connected app stays approved. */
export function IgnoreAppButton({ app }: Props) {
  const [open, setOpen] = useState(false);
  // The app moves to another tab and every count changes, so the lists and counts load afresh.
  const [ignore, { loading }] = usePayloadMutation(IgnoreAppDocument, { update: forgetAppLists });
  if (app.status === "IGNORED" || app.connected) {
    return null;
  }
  const confirm = () => {
    setOpen(false);
    void ignore({ variables: { input: { id: app.id } } }).catch(() =>
      toast.error(t("apps.statusChangeFailed", { name: app.name })),
    );
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button type="button" variant="outline" size="lg" disabled={loading} />}
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
