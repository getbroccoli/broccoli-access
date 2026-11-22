import { expect, it } from "vitest";

import { adminUrlOf } from "./adminUrl";

it("fills the workspace in the admin URL", () => {
  expect(adminUrlOf(LINEAR, { urlKey: "acme" })).toBe("https://linear.app/acme/settings/members");
});

it("encodes each setting as one URL component", () => {
  expect(adminUrlOf("http://example.com/{team}/{area}", { team: "a/b", area: "c?d" })).toBe(
    "http://example.com/a%2Fb/c%3Fd",
  );
});

it.each([{}, { urlKey: 12 }])(
  "has no admin URL without a string workspace setting (%j)",
  (settings) => {
    expect(adminUrlOf(LINEAR, settings)).toBeNull();
  },
);

it.each(["javascript:{x}", "relative/{x}"])("has no admin URL for %s", (template) => {
  expect(adminUrlOf(template, { x: "acme" })).toBeNull();
});

const LINEAR = "https://linear.app/{urlKey}/settings/members";
