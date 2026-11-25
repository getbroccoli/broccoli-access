import { describe, expect, it } from "vitest";

import { activeAccountsToRemove, showRemoveAll } from "./removeAllOffers";

describe("showRemoveAll", () => {
  it("offers Remove all when the directory is suspended and an active account can be removed", () => {
    expect(
      showRemoveAll(null, {
        directoryAccount: { status: "SUSPENDED" },
        offboarding: { accountsToRemove: [activeAccount] },
      }),
    ).toBe(true);
  });

  it("hides Remove all when the directory is active and the person has not been offboarded", () => {
    expect(
      showRemoveAll(null, {
        directoryAccount: { status: "ACTIVE" },
        offboarding: { accountsToRemove: [activeAccount] },
      }),
    ).toBe(false);
  });

  it("hides Remove all before offboarding when only disabled accounts can be removed", () => {
    expect(
      showRemoveAll(null, {
        directoryAccount: { status: "SUSPENDED" },
        offboarding: { accountsToRemove: [disabledAccount] },
      }),
    ).toBe(false);
  });

  it("offers Remove all after offboarding when only disabled accounts can be removed", () => {
    expect(
      showRemoveAll("2026-11-22T10:00:00Z", {
        directoryAccount: { status: "SUSPENDED" },
        offboarding: { accountsToRemove: [disabledAccount] },
      }),
    ).toBe(true);
  });

  it("hides Remove all after offboarding when there are no accounts to remove", () => {
    expect(
      showRemoveAll("2026-11-22T10:00:00Z", {
        directoryAccount: { status: "SUSPENDED" },
        offboarding: { accountsToRemove: [] },
      }),
    ).toBe(false);
  });
});

describe("activeAccountsToRemove", () => {
  it("includes only active accounts in the offboarding follow-up", () => {
    expect(activeAccountsToRemove([disabledAccount, activeAccount])).toEqual([activeAccount]);
  });
});

const activeAccount = { id: "active-member", status: "ACTIVE" } as const;
const disabledAccount = { id: "disabled-member", status: "SUSPENDED" } as const;
