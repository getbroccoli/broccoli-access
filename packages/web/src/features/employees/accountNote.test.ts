import { expect, it } from "vitest";

import { ACCOUNT_NOTE_MAX_LENGTH, accountNoteProblem } from "./accountNote";

it("accepts a note with something to read", () => {
  expect(accountNoteProblem("  Deploys  ")).toBeNull();
});

it.each([
  ["nothing", ""],
  ["spaces", "   "],
  ["a zero-width space", "​"],
])("finds a note of %s blank", (_name, note) => {
  expect(accountNoteProblem(note)).toBe("blank");
});

it("finds a note over the limit too long, not counting the spaces around it", () => {
  const longest = "a".repeat(ACCOUNT_NOTE_MAX_LENGTH);

  expect(accountNoteProblem(` ${longest} `)).toBeNull();
  expect(accountNoteProblem(`${longest}a`)).toBe("tooLong");
});
