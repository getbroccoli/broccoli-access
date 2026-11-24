import { expect, it } from "vitest";

import { couldntChangeHint, couldntChangeReason } from "./couldntChange";

it("explains that a role conflict also needs resolving before retrying after reconnect", () => {
  const hint = couldntChangeHint(
    "AUTHENTICATION_FAILED",
    "INVITE",
    { tryAgain: false, byHand: true, scanNow: false, reconnect: true },
    { app: "Linear", firstName: "Ivan", roleConflict: true },
  );

  expect(hint).toMatch(/reconnect/i);
  expect(hint).toMatch(/role/i);
  expect(hint).not.toContain("After you reconnect, this row shows Try again");
});

it("describes an unavailable invite in Activity without directing the reader to retry it", () => {
  const reason = couldntChangeReason("APP_UNAVAILABLE", {
    action: "INVITE",
    app: "Linear",
    workspace: "Acme",
    credential: "TEXT",
    person: { name: "Ivan Petrov", email: "ivan@acme.example" },
    connectionUserEmail: null,
    toReconnect: false,
    historical: true,
  });

  expect(reason).toContain("Linear");
  expect(reason).toMatch(/invite|invitation|role/i);
  expect(reason).not.toMatch(/try again|trying again|current templates|three tries/i);
});
