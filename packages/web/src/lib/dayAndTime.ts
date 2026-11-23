import { calendarDayOf } from "./calendarDay";
import { formatSince } from "./since";

/**
 * A moment's local time ("08:00") and day ("21 Nov 2026"), the day null when it is today; in
 * `timeZone`, the browser's by default.
 */
export function dayAndTime(
  at: string,
  { now = new Date(), timeZone }: { now?: Date; timeZone?: string } = {},
): { day: string | null; time: string } {
  const moment = new Date(at);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(moment);
  const isToday = calendarDayOf(moment, timeZone) === calendarDayOf(now, timeZone);
  return { day: isToday ? null : formatSince({ at, before: false }, timeZone), time };
}
