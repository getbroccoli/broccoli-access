import { t } from "@/i18n";

/** "Connected": a connection reads the app. */
export function ConnectedBadge() {
  return (
    <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium whitespace-nowrap text-brand-deep">
      {t("apps.connected")}
    </span>
  );
}
