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

it("shows a failed Remove for a disabled member without a Remove offer", () => {
  const account = { ...refusedRemove(null, "NOT_ALLOWED"), offersRemove: false };

  expect(showsCouldntChange(account)).toBe(true);
});

it("hides a stale failed Remove for an active member whose connector can disable accounts", () => {
  const account = {
    status: "ACTIVE",
    offersRemove: false,
    latestChange: { status: "FAILED", action: "REMOVE" },
    app: { containerConnection: { connector: { canDisableAccounts: true } } },
  } as const;

  expect(showsCouldntChange(account)).toBe(false);
});

it("shows a failed Remove for an active member without a Remove offer when the connector cannot disable accounts", () => {
  const account = {
    status: "ACTIVE",
    offersRemove: false,
    latestChange: { status: "FAILED", action: "REMOVE" },
    app: { containerConnection: { connector: { canDisableAccounts: false } } },
  } as const;

  expect(showsCouldntChange(account)).toBe(true);
});

it("hides a failed Remove for an active member in Differences", () => {
  const account = {
    status: "ACTIVE",
    offersRemove: true,
    latestChange: { status: "FAILED", action: "REMOVE" },
    app: { containerConnection: { connector: { canDisableAccounts: false } } },
  } as const;
  const extraAccount = { ...account, onlyIfExtra: true };

  expect(showsCouldntChange(account)).toBe(true);
  expect(showsCouldntChange(extraAccount)).toBe(false);
});

it("keeps a refused Remove visible on a removable active member until a scan allows a fresh Remove", () => {
  const connector = { canDisableAccounts: false };
  const active = {
    ...refusedRemove(null, "NOT_ALLOWED"),
    status: "ACTIVE",
    app: { containerConnection: { connector, scan: null } },
  } as const;
  const scanned = {
    ...active,
    app: { containerConnection: { connector, scan: { readAt: "2026-11-22T10:00:01Z" } } },
  } as const;

  expect.soft(showsCouldntChange(active)).toBe(true);
  expect.soft(offersFreshRemove(active)).toBe(false);
  expect(failedChangeOptions(active).tryAgain).toBe(false);
  expect(offersFreshRemove(scanned)).toBe(true);
  expect(offersFreshRemove({ ...scanned, offersRemove: false })).toBe(false);
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

it("hides a fresh Remove for a removable active member in Differences", () => {
  const account = {
    status: "ACTIVE",
    offersRemove: true,
    app: { containerConnection: { connector: { canDisableAccounts: false } } },
  } as const;
  const extraAccount = { ...account, onlyIfExtra: true };

  expect(offersFreshRemove(account)).toBe(true);
  expect(offersFreshRemove(extraAccount)).toBe(false);
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

it.for([false, true])("explains a refused Remove (historical: %s)", (historical) => {
  const reason = couldntChangeReason("NOT_ALLOWED", {
    app: "Linear",
    workspace: "Acme",
    person: { name: "Hannah Weber", email: "hannah@acme.example" },
    connectionUserEmail: null,
    credential: "TEXT",
    toReconnect: false,
    action: "REMOVE",
    historical,
  });

  expect(reason).toBe("The removal was refused. Nothing changed in Linear.");
});

it("points a refused Remove to a scan or removing by hand, not to someone with more rights", () => {
  const hint = couldntChangeHint(
    "NOT_ALLOWED",
    "REMOVE",
    { tryAgain: false, byHand: true, scanNow: false, reconnect: false },
    { firstName: "Hannah", app: "Linear", canDisableAccounts: true },
  );
  expect(hint).toBe(
    "Trying again won’t help. Scan Linear to see whether Hannah is still disabled, or remove Hannah from Linear yourself and tell Broccoli Access.",
  );
});

it("asks the owner to check the account after a refused Remove when the connector cannot disable accounts", () => {
  const about = { firstName: "Ana", app: "Linear", canDisableAccounts: false };
  const hint = couldntChangeHint(
    "NOT_ALLOWED",
    "REMOVE",
    { tryAgain: false, byHand: true, scanNow: false, reconnect: false },
    about,
  );

  expect(hint).toBe("Scan Linear or remove Ana by hand.");
});
