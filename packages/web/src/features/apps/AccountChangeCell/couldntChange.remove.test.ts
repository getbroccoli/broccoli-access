import { expect, it } from "vitest";

import {
  couldntChangeHint,
  couldntChangeReason,
  failedChangeOptions,
  offersFreshRemove,
  showsCouldntChange,
} from "./couldntChange";

const FAILED_AT = "2026-11-22T10:00:00Z";

function refusedRemove(readAt: string | null, failure: "NOT_ALLOWED" | "UNEXPECTED_RESPONSE") {
  return {
    status: "SUSPENDED",
    offersRemove: true,
    latestChange: { status: "FAILED", action: "REMOVE", failure, finishedAt: FAILED_AT },
    app: { containerConnection: { scan: readAt === null ? null : { readAt } } },
  } as const;
}

it("hides “Couldn’t remove” when a scan finds the account active and it has no Remove offer", () => {
  const latestChange = { status: "FAILED", action: "REMOVE" } as const;
  expect(showsCouldntChange({ status: "SUSPENDED", latestChange })).toBe(true);
  // A scan since read the member active: nothing is left to remove.
  expect(showsCouldntChange({ status: "ACTIVE", latestChange })).toBe(false);
});

it("keeps a refused Remove visible on a removable active member until a scan allows a fresh Remove", () => {
  const active = { ...refusedRemove(null, "NOT_ALLOWED"), status: "ACTIVE" } as const;
  const scanned = {
    ...refusedRemove("2026-11-22T10:00:01Z", "NOT_ALLOWED"),
    status: "ACTIVE",
  } as const;

  expect.soft(showsCouldntChange(active)).toBe(true);
  expect.soft(offersFreshRemove(active)).toBe(false);
  expect(failedChangeOptions(active).tryAgain).toBe(false);
  expect(offersFreshRemove(scanned)).toBe(true);
});

it.for([
  ["no scan since the refusal", null, false],
  ["a scan before the refusal", "2026-11-22T09:59:59Z", false],
  ["a scan since the refusal", "2026-11-22T10:00:01Z", true],
] as const)("offers Remove again after a refusal with %s: %s → %s", ([, readAt, offered]) => {
  expect(offersFreshRemove(refusedRemove(readAt, "NOT_ALLOWED"))).toBe(offered);
});

it("leaves a failed Remove that can be tried again to Try again", () => {
  expect(offersFreshRemove(refusedRemove("2026-11-22T10:00:01Z", "UNEXPECTED_RESPONSE"))).toBe(
    false,
  );
});

it("offers Remove as the server does when no Remove failed", () => {
  const app = { containerConnection: null };
  expect(offersFreshRemove({ status: "SUSPENDED", offersRemove: true, app })).toBe(true);
  expect(offersFreshRemove({ status: "SUSPENDED", offersRemove: false, app })).toBe(false);
  const refused = refusedRemove("2026-11-22T10:00:01Z", "NOT_ALLOWED");
  expect(offersFreshRemove({ ...refused, offersRemove: false })).toBe(false);
});

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
