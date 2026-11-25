import { expect, it } from "vitest";

import { inSentence } from "./connectingFieldName";

it("preserves an acronym at the start of a field label", () => {
  expect(inSentence("API key")).toBe("API key");
});

it("lowercases the opening word without changing the acronym", () => {
  expect(inSentence("Personal API key")).toBe("personal API key");
});
