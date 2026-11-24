import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { DeleteTemplateDocument } from "@/__generated__/graphql";
import { evictRecord, useCache, usePayloadMutation } from "@/apollo";
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
  template: { id: string; name: string };
};

/** Delete, once a dialog confirms it: the template leaves, and the owner returns to Templates. */
export function DeleteTemplateButton({ template }: Props) {
  const navigate = useNavigate();
  const cache = useCache();
  const [open, setOpen] = useState(false);
  const [deleteTemplate, { loading }] = usePayloadMutation(DeleteTemplateDocument);
  const confirm = async () => {
    try {
      await deleteTemplate({ variables: { input: { id: template.id } } });
    } catch {
      toast.error(t("templates.deleteFailed", { name: template.name }));
      return;
    }
    // Left first, so the page never renders the template it no longer has.
    await navigate({ to: "/templates" });
    evictRecord(cache, "Template", template.id);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="px-3.5 text-destructive hover:text-destructive"
          />
        }
      >
        {t("templates.delete")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("templates.deleteTitle", { name: template.name })}</AlertDialogTitle>
          <AlertDialogDescription>{t("templates.deleteDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("templates.cancel")}</AlertDialogCancel>
          <AlertDialogAction type="button" disabled={loading} onClick={() => void confirm()}>
            {t("templates.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
