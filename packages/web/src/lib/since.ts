import { t } from "@/i18n";

/**
 * Since as the screens show it: "12 Aug 2026", or "Before 25 May 2026" for a grant older than the
 * log; in `timeZone`, the browser's by default.
 */
export function formatSince(
  { at, before }: { at: string; before: boolean },
  timeZone?: string,
): string {
  // en-US names September "Sep", as the screens do, where en-GB now says "Sept".
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).formatToParts(new Date(at));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  const day = `${part("day")} ${part("month")} ${part("year")}`;
  return before ? t("apps.since.before", { day }) : day;
}
