import { expect, it } from "vitest";

import { formatLastScan } from "./lastScan";

it("says when the connection has never been scanned", () => {
  expect(
    formatLastScan(null, { now: new Date("2026-11-22T12:00:00Z"), timeZone: "Europe/Berlin" }),
  ).toBe("Not scanned yet.");
});

it("shows today's scan time on the local calendar day even when its UTC day differs", () => {
  expect(
    formatLastScan("2026-11-21T23:00:00Z", {
      now: new Date("2026-11-22T03:00:00Z"),
      timeZone: "Asia/Tokyo",
    }),
  ).toBe("Scanned today at 08:00.");
});

it("shows the date and local time of an older scan", () => {
  expect(
    formatLastScan("2026-11-21T07:00:00Z", {
      now: new Date("2026-11-22T12:00:00Z"),
      timeZone: "Europe/Berlin",
    }),
  ).toBe("Scanned 21 Nov 2026 at 08:00.");
});
