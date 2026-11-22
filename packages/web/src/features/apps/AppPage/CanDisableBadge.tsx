import { UserMinus } from "@phosphor-icons/react";

import { t } from "@/i18n";

/** "Can disable": a connector can disable and enable the app's accounts, connected or not. */
export function CanDisableBadge() {
  return (
    <span
      title={t("apps.page.canDisableTitle")}
      className="inline-flex items-center gap-1 rounded-full border border-foreground/25 bg-background px-[7px] py-px text-xs font-medium text-foreground/85"
    >
      <UserMinus size={12} weight="bold" aria-hidden />
      {t("apps.page.canDisable")}
    </span>
  );
}
