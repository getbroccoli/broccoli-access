import { expect, it } from "vitest";

import { provisionButtonLabel } from "./provisionButtonLabel";

it("offers Try again for a failed automatic invite", () => {
  expect(provisionButtonLabel([failedInvite])).toBe("apps.couldnt.tryAgain");
});

it("keeps Provision when the batch includes a first-time invite", () => {
  const firstInvite = { provisionStep: { action: "INVITE" }, latestProvisionChange: null } as const;

  expect(provisionButtonLabel([failedInvite, firstInvite])).toBe("people.provision.button");
});

it("keeps Provision when the current step is by hand", () => {
  const byHand = { ...failedInvite, provisionStep: { action: "GIVE_BY_HAND" } } as const;

  expect(provisionButtonLabel([byHand])).toBe("people.provision.button");
});

it("keeps Provision after a missing connection even with an automatic step", () => {
  const noConnection = {
    ...failedInvite,
    latestProvisionChange: { status: "FAILED", failure: "NO_CONNECTION" },
  } as const;

  expect(provisionButtonLabel([noConnection])).toBe("people.provision.button");
});

it("keeps Provision when no rows are ready", () => {
  expect(provisionButtonLabel([])).toBe("people.provision.button");
});

const failedInvite = {
  provisionStep: { action: "INVITE" },
  latestProvisionChange: { status: "FAILED", failure: "APP_UNAVAILABLE" },
} as const;
