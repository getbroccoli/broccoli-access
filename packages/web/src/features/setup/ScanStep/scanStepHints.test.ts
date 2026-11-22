import { expect, it } from "vitest";

import { scanStepHints } from "./scanStepHints";

it("says the failed scan could not read Google Workspace and stops the later steps", () => {
  expect(
    scanStepHints({
      people: { state: "FAILED", count: null, suspended: null },
      apps: { state: "FAILED", count: null },
      signInLogs: { state: "FAILED" },
    }),
  ).toEqual({
    people: "Couldn’t read Google Workspace",
    apps: "Stopped",
    signInLogs: "Stopped",
  });
});
