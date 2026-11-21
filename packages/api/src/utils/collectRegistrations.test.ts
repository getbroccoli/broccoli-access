import { expect, test } from "vitest";

import { collectRegistrations } from "./collectRegistrations";

test("merges distinct registration keys into a frozen catalog", () => {
  const registrations = collectRegistrations("record type", [
    { manual: { title: "To do" } },
    { approval: { title: "Approval" } },
  ]);

  expect(registrations).toEqual({ manual: { title: "To do" }, approval: { title: "Approval" } });
  expect(Object.isFrozen(registrations)).toBe(true);
});

test("refuses a registration key used by two parts", () => {
  expect(() => collectRegistrations("record type", [{ x: "first" }, { x: "second" }])).toThrow(
    "record type x is registered twice.",
  );
});
