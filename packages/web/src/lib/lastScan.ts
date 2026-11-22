import { t } from "@/i18n";

import { calendarDayOf } from "./calendarDay";

/**
 * A connection's last successful scan as the screens show it: "Scanned today at 08:00.", "Scanned
 * 21 Nov 2026 at 08:00." for an earlier day, or "Not scanned yet."; in `timeZone`, the browser's
 * by default.
 */
export function formatLastScan(
  readAt: string | null,
  { now = new Date(), timeZone }: { now?: Date; timeZone?: string } = {},
): string {
  if (readAt === null) {
    return t("scans.lastScan.never");
  }
  const scannedAt = new Date(readAt);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(scannedAt);
  if (calendarDayOf(scannedAt, timeZone) === calendarDayOf(now, timeZone)) {
    return t("scans.lastScan.today", { time });
  }
  return t("scans.lastScan.day", { day: formatDay(scannedAt, timeZone), time });
}

/** "21 Nov 2026"; en-US names September "Sep", as the screens do, where en-GB says "Sept". */
function formatDay(date: Date, timeZone: string | undefined): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("day")} ${part("month")} ${part("year")}`;
}
