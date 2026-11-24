import { expect, it } from "vitest";

import { employeeMatcher } from "./suggestEmployee";

it.each([
  ["Ana Ruiz", "ana.ruiz@gmail.example"],
  ["Ana Ruis", "private@example.com"],
  [null, "ana.ruiiz@personal.example"],
  [null, "ana.riz@personal.example"],
] as const)("suggests Ana for %s at %s", (displayName, email) => {
  expect(employeeMatcher([BEN, ANA])({ email, displayName })).toBe(ANA.id);
});

it("prefers an exact match over a similar name", () => {
  const other = { ...ANA, id: "other", lastName: "Ruis", email: "other@example.com" };
  const match = employeeMatcher([other, ANA]);

  expect(match({ email: "private@example.com", displayName: "Ana Ruiz" })).toBe(ANA.id);
  expect(match({ email: "private@example.com", displayName: "Ana Ruis" })).toBe(other.id);
});

it("leaves an unrelated account without a suggestion", () => {
  const match = employeeMatcher([ANA, BEN]);
  expect(match({ email: "reports@example.com", displayName: "Reports bot" })).toBeNull();
});

it("leaves equally close employees without a suggestion", () => {
  const otherAna = { ...ANA, id: "other-ana", email: "aruiz@example.com" };
  const match = employeeMatcher([ANA, otherAna]);

  expect(match({ email: "private@example.com", displayName: "Ana Ruiz" })).toBeNull();
});

it("leaves the suggestion empty when the name and email each exactly match a different employee", () => {
  const match = employeeMatcher([ANA, BEN]);

  expect(match({ email: "ben.ito@private.example", displayName: "Ana Ruiz" })).toBeNull();
});

const ANA = { id: "ana", firstName: "Ana", lastName: "Ruiz", email: "ana.ruiz@example.com" };
const BEN = { id: "ben", firstName: "Ben", lastName: "Ito", email: "ben.ito@example.com" };
