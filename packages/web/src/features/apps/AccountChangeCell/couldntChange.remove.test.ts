import { expect, it } from "vitest";

import { couldntChangeHint, couldntChangeReason, failedChangeOptions } from "./couldntChange";

it.for([
  ["UNEXPECTED_RESPONSE", true, true],
  ["UNEXPECTED_RESPONSE", false, false],
  ["NOT_ALLOWED", true, false],
] as const)(
  "offers retry after a failed Remove (%s, offersRemove %s → %s)",
  ([failure, offersRemove, tryAgain]) => {
    expect(
      failedChangeOptions({
        offeredChange: "REACTIVATE",
        offersRemove,
        latestChange: { action: "REMOVE", failure, finishedAt: "2026-11-22T10:00:00Z" },
        app: { containerConnection: { status: "CONNECTED" } },
      }),
    ).toEqual({ tryAgain, byHand: true, scanNow: false, reconnect: false });
  },
);

it("explains that a failed Remove may already have removed the member", () => {
  const reason = couldntChangeReason("UNEXPECTED_RESPONSE", {
    app: "Linear",
    workspace: "Acme",
    person: { name: "Hannah Weber", email: "hannah@acme.example" },
    connectionUserEmail: null,
    credential: "TEXT",
    toReconnect: false,
    action: "REMOVE",
  });
  expect(reason).toContain(
    "Broccoli Access couldn’t confirm the removal. Check the member list in Linear.",
  );
  expect(reason).not.toContain("Nothing changed");
});

it("does not blame the app alone for a refused Remove, which Broccoli Access may have stopped", () => {
  const reason = couldntChangeReason("NOT_ALLOWED", {
    app: "Linear",
    workspace: "Acme",
    person: { name: "Hannah Weber", email: "hannah@acme.example" },
    connectionUserEmail: null,
    credential: "TEXT",
    toReconnect: false,
    action: "REMOVE",
  });
  expect(reason).toContain("Only a disabled member can be removed");
  expect(reason).toContain("Nothing changed in Linear.");
  expect(reason).not.toContain("Linear doesn’t allow this change");
});

it("points a refused Remove to a scan or removing by hand, not to someone with more rights", () => {
  const hint = couldntChangeHint(
    "NOT_ALLOWED",
    "REMOVE",
    { tryAgain: false, byHand: true, scanNow: false, reconnect: false },
    { firstName: "Hannah", app: "Linear" },
  );
  expect(hint).toBe(
    "Trying again won’t help. Scan Linear to see whether Hannah is still disabled, or remove Hannah from Linear yourself and tell Broccoli Access.",
  );
});
