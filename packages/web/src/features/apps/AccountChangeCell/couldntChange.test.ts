import { expect, it } from "vitest";

import type {
  AccountChangeAction,
  AccountChangeFailure,
  AccountChangeStatus,
  AppAccountStatus,
} from "@/__generated__/graphql";
import {
  couldntChangeHint,
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
  expect(failedChangeOptions(failedSuspend("NOT_ALLOWED", null))).toEqual({
    tryAgain: false,
    byHand: true,
    scanNow: false,
  });
});

it.for([null, "2026-11-22T09:00:00Z", "2026-11-22T10:00:00Z"])(
  "offers only Scan now after ACCOUNT_NOT_FOUND when the last scan was %s",
  (lastScanAt) => {
    expect(failedChangeOptions(failedSuspend("ACCOUNT_NOT_FOUND", lastScanAt))).toEqual({
      tryAgain: false,
      byHand: false,
      scanNow: true,
    });
  },
);

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
  expect(failedChangeOptions(failedSuspend(failure, null))).toEqual({
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
      failedChangeOptions(failedSuspend(failure, "2026-11-22T11:00:00Z", offeredChange)),
    ).toEqual(expected);
  },
);

it.for([
  [
    "NOT_ALLOWED",
    "SUSPEND",
    { tryAgain: false, byHand: true, scanNow: false },
    "Trying again won’t help. If someone with more rights in Linear makes the change there, tell Broccoli Access.",
  ],
  [
    "ACCOUNT_NOT_FOUND",
    "SUSPEND",
    { tryAgain: false, byHand: false, scanNow: true },
    "Trying again won’t help. Scan Linear to bring its member list up to date.",
  ],
  [
    "ACCOUNT_NOT_FOUND",
    "SUSPEND",
    { tryAgain: true, byHand: false, scanNow: false },
    "Linear was scanned since, so trying again may help.",
  ],
  [
    "UNEXPECTED_RESPONSE",
    "SUSPEND",
    { tryAgain: true, byHand: true, scanNow: false },
    "Try again in a while, or deactivate Ana in Linear’s admin yourself and tell Broccoli Access.",
  ],
  [
    "UNEXPECTED_RESPONSE",
    "REACTIVATE",
    { tryAgain: true, byHand: true, scanNow: false },
    "Try again in a while, or reactivate Ana in Linear’s admin yourself and tell Broccoli Access.",
  ],
  [
    "APP_UNAVAILABLE",
    "SUSPEND",
    { tryAgain: false, byHand: true, scanNow: false },
    "Deactivate Ana in Linear’s admin yourself and tell Broccoli Access.",
  ],
  [
    "APP_UNAVAILABLE",
    "REACTIVATE",
    { tryAgain: false, byHand: true, scanNow: false },
    "Reactivate Ana in Linear’s admin yourself and tell Broccoli Access.",
  ],
] as const)(
  "suggests what to do after %s for %s with options %j",
  ([failure, action, options, hint]) => {
    expect(couldntChangeHint(failure, action, options, { firstName: "Ana", app: "Linear" })).toBe(
      hint,
    );
  },
);

function failedSuspend(
  failure: AccountChangeFailure,
  readAt: string | null,
  offeredChange: AccountChangeAction | null = "SUSPEND",
) {
  return {
    offeredChange,
    latestChange: { action: "SUSPEND" as const, failure, finishedAt: "2026-11-22T10:00:00Z" },
    app: { containerConnection: { scan: { readAt } } },
  };
}
