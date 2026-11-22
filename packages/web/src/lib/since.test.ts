import { expect, it } from "vitest";

import { formatSince } from "./since";

it("formats a dated grant as a day, month and year", () => {
  expect(formatSince({ at: "2026-08-12T10:00:00Z", before: false }, "UTC")).toBe("12 Aug 2026");
});

it("prefixes a grant older than the log with Before", () => {
  expect(formatSince({ at: "2026-05-25T08:00:00Z", before: true }, "UTC")).toBe(
    "Before 25 May 2026",
  );
});

it("abbreviates September to Sep", () => {
  expect(formatSince({ at: "2026-09-30T10:00:00Z", before: false }, "UTC")).toBe("30 Sep 2026");
});

it("uses the supplied time zone to choose the calendar day", () => {
  expect(formatSince({ at: "2026-08-12T23:30:00Z", before: false }, "Europe/Berlin")).toBe(
    "13 Aug 2026",
  );
});
