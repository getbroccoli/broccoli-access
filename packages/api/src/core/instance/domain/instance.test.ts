import { expect, it } from "vitest";

import { Instance, type InstanceState, OwnerExistsError, SetupInProgressError } from ".";

it("claims an owner without changing the original instance and refuses a second claim", () => {
  const instance = exampleInstance();

  const claimed = instance.claimOwner("owner");

  expect(instance.ownerUserId).toBeNull();
  expect(claimed.ownerUserId).toBe("owner");
  expect(() => claimed.claimOwner("another")).toThrow(OwnerExistsError);
});

it("does not let callers alter the stored setup session through its snapshot", () => {
  const session = { tokenHash: "hash", expiresAt: new Date("2026-10-10") };
  const instance = exampleInstance({ setupSession: session });

  session.tokenHash = "changed";
  instance.setupSession!.expiresAt.setUTCFullYear(2030);

  expect(instance.setupSession).toEqual({ tokenHash: "hash", expiresAt: new Date("2026-10-10") });
  expect(() => instance.requireHeldSetup(null, new Date("2026-10-09"))).toThrow(
    SetupInProgressError,
  );
});

function exampleInstance(state: Partial<InstanceState> = {}): Instance {
  return new Instance({
    ownerUserId: null,
    step: "owner",
    setupSession: null,
    mailSource: null,
    ...state,
  });
}
