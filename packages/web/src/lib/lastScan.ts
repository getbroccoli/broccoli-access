import { t } from "@/i18n";

import { dayAndTime } from "./dayAndTime";

/**
 * A connection's last successful scan as the screens show it: "Scanned today at 08:00.", "Scanned
 * 21 Nov 2026 at 08:00." for an earlier day, or "Not scanned yet."; in `timeZone`, the browser's
 * by default.
 */
export function formatLastScan(
  readAt: string | null,
  options: { now?: Date; timeZone?: string } = {},
): string {
  if (readAt === null) {
    return t("scans.lastScan.never");
  }
  const { day, time } = dayAndTime(readAt, options);
  return day === null
    ? t("scans.lastScan.today", { time })
    : t("scans.lastScan.day", { day, time });
}
