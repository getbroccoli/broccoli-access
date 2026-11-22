import { expect, it } from "vitest";

import { accountSince, appSince } from "./since";

it("uses the grant date when the account has one", () => {
  const since = accountSince({ grantedAt: AUGUST, grantedBefore: MAY, firstSeenAt: NOVEMBER });

  expect(since).toEqual({ at: AUGUST, before: false });
});

it("shows before the log start when the grant predates the log", () => {
  const since = accountSince({ grantedAt: null, grantedBefore: MAY, firstSeenAt: NOVEMBER });

  expect(since).toEqual({ at: MAY, before: true });
});

it("uses the first seen date when the account has no grant dates", () => {
  const since = accountSince({ grantedAt: null, grantedBefore: null, firstSeenAt: NOVEMBER });

  expect(since).toEqual({ at: NOVEMBER, before: false });
});

it("shows before the earliest account's log start for an app with mixed dates", () => {
  const since = appSince([
    { grantedAt: AUGUST, grantedBefore: null, firstSeenAt: NOVEMBER },
    { grantedAt: null, grantedBefore: MAY, firstSeenAt: NOVEMBER },
  ]);

  expect(since).toEqual({ at: MAY, before: true });
});

it("uses the earliest grant date when every account is dated", () => {
  const since = appSince([
    { grantedAt: AUGUST, grantedBefore: null, firstSeenAt: NOVEMBER },
    { grantedAt: MAY, grantedBefore: null, firstSeenAt: NOVEMBER },
  ]);

  expect(since).toEqual({ at: MAY, before: false });
});

it.each([false, true])(
  "lets before win a tied date regardless of account order (%s)",
  (reverse) => {
    const accounts = [
      { grantedAt: MAY, grantedBefore: null, firstSeenAt: NOVEMBER },
      { grantedAt: null, grantedBefore: MAY, firstSeenAt: NOVEMBER },
    ];

    const since = appSince(reverse ? accounts.toReversed() : accounts);

    expect(since).toEqual({ at: MAY, before: true });
  },
);

it("has no since date for an app without accounts", () => {
  expect(appSince([])).toBeNull();
});

const MAY = new Date("2026-05-25T08:00:00Z");
const AUGUST = new Date("2026-08-12T10:00:00Z");
const NOVEMBER = new Date("2026-11-22T12:00:00Z");
