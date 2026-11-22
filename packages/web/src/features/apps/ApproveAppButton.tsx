import { toast } from "sonner";

import { ApproveAppDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import type { AppRow } from "./AppTable";
import { forgetAppLists } from "./cache";

type Props = {
  app: Pick<AppRow, "id" | "name" | "status">;
  /** Small in a table row, the default in a page's header. */
  size?: "sm" | "lg";
};

/** Approve for an app not approved yet. */
export function ApproveAppButton({ app, size = "sm" }: Props) {
  // The app moves to another tab and every count changes, so the lists and counts load afresh.
  const [approve, { loading }] = usePayloadMutation(ApproveAppDocument, {
    update: forgetAppLists,
  });
  if (app.status === "APPROVED") {
    return null;
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      disabled={loading}
      aria-label={t("apps.approveApp", { name: app.name })}
      onClick={() =>
        void approve({ variables: { input: { id: app.id } } }).catch(() =>
          toast.error(t("apps.statusChangeFailed", { name: app.name })),
        )
      }
    >
      {t("apps.approve")}
    </Button>
  );
}
