import { t } from "@/i18n";

/** "Integration user", marked as the recommended way to connect. */
export function IntegrationUserTitle() {
  return (
    <span className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
      {t("settings.connectWay.integrationUser")}
      <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-deep">
        {t("settings.connectWay.recommended")}
      </span>
    </span>
  );
}
