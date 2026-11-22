import { expect, it } from "vitest";

import { appLogoUrl } from "./appLogoUrl";
import notionLogo from "./logos/notion.svg?url";

it("returns the bundled app's own SVG URL", () => {
  expect(appLogoUrl("notion")).toBe(notionLogo);
});

it("returns no URL for catalog and unknown keys without a bundled logo", () => {
  expect(appLogoUrl("slack")).toBeUndefined();
  expect(appLogoUrl("unknown_app")).toBeUndefined();
});

it("returns no URL without a catalog key", () => {
  expect(appLogoUrl(null)).toBeUndefined();
});
