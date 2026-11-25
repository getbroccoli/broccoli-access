import { expect, it } from "vitest";

import type { ActionRunAnswer } from "../connectorCalls.js";
import { expectRepeatedInvite } from "./describeInviteConformance.js";

it.for([
  { reason: "another change", changed: true },
  { reason: "a different source key", sourceKey: "another-member" },
  { reason: "a different email", email: "another.person@acme.example" },
])("rejects an instant invite retry that reports $reason", ({ changed, sourceKey, email }) => {
  const first = memberAnswer({ changed: true });
  const retry = memberAnswer({ changed, sourceKey, email });

  expect(() => expectRepeatedInvite(first, retry, INVITEE_EMAIL)).toThrow();
});

const INVITEE_EMAIL = "new.hire@acme.example";

function memberAnswer({
  changed = false,
  sourceKey = "member",
  email = INVITEE_EMAIL,
} = {}): ActionRunAnswer {
  return {
    changed,
    account: {
      sourceKey,
      values: { email, displayName: "New Hire", status: "active", isConnectionUser: false },
    },
  };
}
