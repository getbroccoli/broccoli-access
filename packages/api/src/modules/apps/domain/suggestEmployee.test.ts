import { expect, it } from "vitest";

import { suggestEmployee } from "./suggestEmployee";

it.each([
  ["Ana Ruiz", "ana.ruiz@gmail.example"],
  ["Ana Ruis", "private@example.com"],
  [null, "ana.ruiiz@personal.example"],
] as const)("suggests Ana for %s at %s", (displayName, email) => {
  expect(suggestEmployee({ email, displayName }, [BEN, ANA])).toBe(ANA.id);
});

it("leaves an unrelated account without a suggestion", () => {
  expect(
    suggestEmployee({ email: "reports@example.com", displayName: "Reports bot" }, [ANA, BEN]),
  ).toBeNull();
});

it("leaves equally close employees without a suggestion", () => {
  const otherAna = { ...ANA, id: "other-ana", email: "aruiz@example.com" };

  expect(
    suggestEmployee({ email: "private@example.com", displayName: "Ana Ruiz" }, [ANA, otherAna]),
  ).toBeNull();
});

const ANA = { id: "ana", firstName: "Ana", lastName: "Ruiz", email: "ana.ruiz@example.com" };
const BEN = { id: "ben", firstName: "Ben", lastName: "Ito", email: "ben.ito@example.com" };
