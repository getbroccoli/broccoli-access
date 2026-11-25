import { expect, it } from "vitest";

import { ACCOUNT_NOTE_MAX_LENGTH, parseAccountNote } from "./accountNote";

it("trims the whitespace around a note", () => {
  expect(parseAccountNote("  Deploys  ")).toEqual({ note: "Deploys" });
});

it.each([
  ["nothing", ""],
  ["spaces and line breaks", " \n\t "],
  ["non-breaking spaces", "  "],
  ["a zero-width space", "​"],
  ["a zero-width joiner, a word joiner and a byte order mark", " ‍⁠﻿ "],
])("refuses a note of %s as blank", (_name, input) => {
  expect(parseAccountNote(input)).toEqual({ problem: "required" });
});

it("keeps the invisible characters inside a note, which join an emoji", () => {
  const family = "👩‍👧";

  expect(parseAccountNote(family)).toEqual({ note: family });
});

it("accepts a note of the longest length and refuses one character more", () => {
  const longest = "a".repeat(ACCOUNT_NOTE_MAX_LENGTH);

  expect(parseAccountNote(longest)).toEqual({ note: longest });
  expect(parseAccountNote(`${longest}a`)).toEqual({ problem: "too_long" });
});
