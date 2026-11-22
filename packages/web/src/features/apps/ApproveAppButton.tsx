import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import type { AppRow } from "./AppTable";

type Props = {
  app: Pick<AppRow, "name" | "status">;
  /** Small in a table row, the default in a page's header. */
  size?: "sm" | "lg";
  disabled: boolean;
  onApprove: () => void;
};

/** Approve for an app not approved yet. */
export function ApproveAppButton({ app, size = "sm", disabled, onApprove }: Props) {
  if (app.status === "APPROVED") {
    return null;
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      disabled={disabled}
      aria-label={t("apps.approveApp", { name: app.name })}
      onClick={onApprove}
    >
      {t("apps.approve")}
    </Button>
  );
}
