import { expect, it } from "vitest";

import { needsGoogleReconnect } from "./googleScan";

it("offers Google reconnect for failed authentication or missing permission", () => {
  expect(needsGoogleReconnect("AUTHENTICATION_FAILED")).toBe(true);
  expect(needsGoogleReconnect("PERMISSION_MISSING")).toBe(true);
  expect(needsGoogleReconnect("APP_UNAVAILABLE")).toBe(false);
  expect(needsGoogleReconnect(null)).toBe(false);
});
