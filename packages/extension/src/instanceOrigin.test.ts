import { expect, test } from "vitest";

import { isPairableOrigin, parseInstanceOrigin } from "./instanceOrigin";

test.for([
  "https://access.acme.example",
  "https://access.acme.example:8443",
  "http://localhost",
  "http://localhost:3000",
  "http://127.0.0.1:8080",
  "http://[::1]:3000",
])("allows pairing with %s", (origin) => {
  expect(isPairableOrigin(origin)).toBe(true);
});

test.for([
  "http://access.acme.example",
  "http://192.168.1.10:8080",
  "http://localhost.evil.example",
])("refuses plain HTTP outside loopback at %s", (origin) => {
  expect(isPairableOrigin(origin)).toBe(false);
});

test.for(["https://access.acme.example:8443", "http://[::1]:3000"])(
  "returns the bare pairable origin %s",
  (origin) => {
    expect(parseInstanceOrigin(origin)).toBe(origin);
  },
);

test.for([
  null,
  "not a URL",
  "https://access.acme.example/",
  "https://access.acme.example/x",
  "https://access.acme.example?x=1",
  "https://access.acme.example#x",
  "javascript:alert(1)",
  "chrome-extension://abc",
  "http://access.acme.example",
])("returns null for %j", (raw) => {
  expect(parseInstanceOrigin(raw)).toBeNull();
});
