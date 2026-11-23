import { expect, it } from "vitest";

import type {
  AccountChangeAction,
  AccountChangeFailure,
  AccountChangeStatus,
  AppAccountStatus,
} from "@/__generated__/graphql";
import {
  couldntChangeOptions,
  couldntChangeReason,
  failedChangeOptions,
  showsCouldntChange,
} from "./couldntChange";

it.for([
  [
    "UNEXPECTED_RESPONSE",
    "TEXT",
    null,
    "Linear gave an answer Broccoli Access doesn’t recognise. Linear may have changed how its admin pages work.",
  ],
  [
    "BLOCKED_BY_CHECK",
    "TEXT",
    null,
    "Linear asked for a check that Broccoli Access never gets past.",
  ],
  ["RATE_LIMITED", "TEXT", null, "Linear didn’t answer after three tries."],
  ["APP_UNAVAILABLE", "TEXT", null, "Linear didn’t answer after three tries."],
  ["AUTHENTICATION_FAILED", "TEXT", null, "Linear refused the API key: it was revoked or expired."],
  ["AUTHENTICATION_FAILED", "APP_SESSION", null, "Your Linear session expired or was signed out."],
  [
    "PERMISSION_MISSING",
    "TEXT",
    "admin@acme.example",
    "admin@acme.example is no longer an admin in Linear.",
  ],
  ["PERMISSION_MISSING", "TEXT", null, "The connected account is no longer an admin in Linear."],
  [
    "WRONG_WORKSPACE",
    "APP_SESSION",
    null,
    "Your Linear session reaches another workspace, not Acme.",
  ],
  ["WRONG_WORKSPACE", "TEXT", null, "Your Linear API key reaches another workspace, not Acme."],
  [
    "ACCOUNT_NOT_FOUND",
    "TEXT",
    null,
    "Linear has no member matching Ana Ruiz (ana@acme.example). The account may have been removed, or its email changed in Linear.",
  ],
  [
    "NOT_ALLOWED",
    "TEXT",
    null,
    "Linear doesn’t allow this change. Linear refuses it for some members, such as the workspace’s owner.",
  ],
  [
    "OWNER_BROWSER_LOST",
    "APP_SESSION",
    null,
    "The Chrome window making the change closed before Linear answered.",
  ],
] as const)(
  "explains %s with %s and connection email %s",
  ([failure, credential, connectionUserEmail, reason]) => {
    expect(
      couldntChangeReason(failure, {
        app: "Linear",
        workspace: "Acme",
        person: { name: "Ana Ruiz", email: "ana@acme.example" },
        connectionUserEmail,
        credential,
      }),
    ).toBe(`${reason} Nothing changed in Linear.`);
  },
);

it("offers only by hand after NOT_ALLOWED", () => {
  expect(couldntChangeOptions("NOT_ALLOWED", { failedAt, lastScanAt: null })).toEqual({
    tryAgain: false,
    byHand: true,
    scanNow: false,
  });
});

it.for([null, "2026-11-22T09:00:00Z", "2026-11-22T10:00:00Z"])(
  "offers only Scan now after ACCOUNT_NOT_FOUND when the last scan was %s",
  (lastScanAt) => {
    expect(couldntChangeOptions("ACCOUNT_NOT_FOUND", { failedAt, lastScanAt })).toEqual({
      tryAgain: false,
      byHand: false,
      scanNow: true,
    });
  },
);

it("offers only Try again after ACCOUNT_NOT_FOUND once a later scan finished", () => {
  expect(
    couldntChangeOptions("ACCOUNT_NOT_FOUND", { failedAt, lastScanAt: "2026-11-22T11:00:00Z" }),
  ).toEqual({
    tryAgain: true,
    byHand: false,
    scanNow: false,
  });
});

it.for([
  "UNEXPECTED_RESPONSE",
  "BLOCKED_BY_CHECK",
  "RATE_LIMITED",
  "APP_UNAVAILABLE",
  "AUTHENTICATION_FAILED",
  "PERMISSION_MISSING",
  "WRONG_WORKSPACE",
  "OWNER_BROWSER_LOST",
] as const)("offers Try again and by hand after %s", (failure) => {
  expect(couldntChangeOptions(failure, { failedAt, lastScanAt: null })).toEqual({
    tryAgain: true,
    byHand: true,
    scanNow: false,
  });
});

it.for([
  ["ACTIVE", { status: "FAILED", action: "SUSPEND" }, true],
  ["SUSPENDED", { status: "FAILED", action: "SUSPEND" }, false],
  ["SUSPENDED", { status: "FAILED", action: "REACTIVATE" }, true],
  ["ACTIVE", { status: "FAILED", action: "REACTIVATE" }, false],
  ["ACTIVE", { status: "RUNNING", action: "SUSPEND" }, false],
  ["ACTIVE", { status: "SUCCEEDED", action: "SUSPEND" }, false],
  ["ACTIVE", { status: "DONE_BY_HAND", action: "SUSPEND" }, false],
  ["ACTIVE", null, false],
] satisfies [
  AppAccountStatus,
  { status: AccountChangeStatus; action: AccountChangeAction } | null,
  boolean,
][])(
  "shows the failure only while the requested status is unmet (%s, %j → %s)",
  ([status, latestChange, visible]) => {
    expect(showsCouldntChange({ status, latestChange })).toBe(visible);
  },
);

it.for([
  ["ACCOUNT_NOT_FOUND", "SUSPEND", { tryAgain: true, byHand: false, scanNow: false }],
  ["ACCOUNT_NOT_FOUND", null, { tryAgain: false, byHand: false, scanNow: true }],
  ["UNEXPECTED_RESPONSE", null, { tryAgain: false, byHand: true, scanNow: false }],
] satisfies [
  AccountChangeFailure,
  AccountChangeAction | null,
  ReturnType<typeof failedChangeOptions>,
][])(
  "offers recovery options after a later scan for %s with offered change %s",
  ([failure, offeredChange, expected]) => {
    expect(
      failedChangeOptions({
        offeredChange,
        latestChange: { action: "SUSPEND", failure, finishedAt: failedAt },
        app: { containerConnection: { scan: { readAt: "2026-11-22T11:00:00Z" } } },
      }),
    ).toEqual(expected);
  },
);

const failedAt = "2026-11-22T10:00:00Z";
