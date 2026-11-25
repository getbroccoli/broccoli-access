import { expect, it } from "vitest";

import { type ProvisionFacts, provisionActionOf } from "./provision";

/** A missing app of a person active in the directory, connected, with nothing offered or waiting. */
const MISSING: ProvisionFacts = {
  missing: true,
  activeInDirectory: true,
  connected: true,
  enableOffered: false,
  inviteOffered: false,
  waitsByHand: false,
  lastFailure: null,
};

it("invites to a missing app whose connection offers Invite", () => {
  expect(provisionActionOf({ ...MISSING, inviteOffered: true })).toBe("invite");
});

it("enables the disabled account of a missing app", () => {
  expect(provisionActionOf({ ...MISSING, enableOffered: true })).toBe("reactivate");
});

it("gives a missing app without a connection by hand", () => {
  expect(provisionActionOf({ ...MISSING, connected: false })).toBe("give_by_hand");
});

it("leaves an app that already waits for I did it by hand", () => {
  expect(provisionActionOf({ ...MISSING, connected: false, waitsByHand: true })).toBeNull();
});

it("leaves a connected app that offers neither Invite nor Enable now", () => {
  expect(provisionActionOf(MISSING)).toBeNull();
});

it.for(["not_allowed", "account_not_found"] as const)(
  "leaves a change that last failed with %s to its own row",
  (lastFailure) => {
    expect(provisionActionOf({ ...MISSING, enableOffered: true, lastFailure })).toBeNull();
    expect(provisionActionOf({ ...MISSING, inviteOffered: true, lastFailure })).toBeNull();
  },
);

it("tries again a change that last failed for another reason", () => {
  const facts = { ...MISSING, inviteOffered: true, lastFailure: "unexpected_response" } as const;

  expect(provisionActionOf(facts)).toBe("invite");
});

it("leaves an app that is not missing", () => {
  expect(provisionActionOf({ ...MISSING, missing: false, inviteOffered: true })).toBeNull();
});

it("gives nothing to a person who is not active in the directory", () => {
  expect(provisionActionOf({ ...MISSING, activeInDirectory: false, connected: false })).toBeNull();
});
