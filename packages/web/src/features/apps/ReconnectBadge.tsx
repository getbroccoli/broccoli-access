import { t } from "@/i18n";

/** "Reconnect": the app's connection stopped working until the owner reconnects it. */
export function ReconnectBadge() {
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-amber-900">
      {t("apps.reconnect.badge")}
    </span>
  );
}
