import { expect, test } from "vitest";

import { appSessionCookiesOf, appSessionStorageOf, hostPatternsOf } from "./appSession";

test.for(["notexample.com", "example.com.evil.test", "unrelated.test"])(
  "excludes cookies from %s when only example.com is allowed",
  (domain) => {
    expect(appSessionCookiesOf([{ ...PREFERENCE, domain }], ["example.com"])).toEqual([]);
  },
);

test("excludes unrequested storage keys", () => {
  expect(appSessionStorageOf({ theme: "light", unrelated: "private" }, ["theme"])).toEqual({
    theme: "light",
  });
});

test.for([{}, { theme: 0 }])(
  "requires a string for every requested storage key in %j",
  (values) => {
    expect(appSessionStorageOf(values, ["theme"])).toBeNull();
  },
);

test("requests the named hosts and their subdomains", () => {
  expect(hostPatternsOf(["example.com", "another.test"])).toEqual([
    "http://*.example.com/*",
    "https://*.example.com/*",
    "http://*.another.test/*",
    "https://*.another.test/*",
  ]);
});

test.for([".example.com", "example.com", "app.example.com"])(
  "keeps the session cookie for %s without an expiry",
  (domain) => {
    const cookie = { ...PREFERENCE, domain };
    expect(appSessionCookiesOf([cookie], ["example.com"])).toStrictEqual([
      {
        name: "theme",
        value: "light",
        domain,
        path: "/settings",
        secure: true,
        httpOnly: false,
        sameSite: "Lax",
      },
    ]);
  },
);

test.for([
  ["no_restriction", "None"],
  ["lax", "Lax"],
  ["strict", "Strict"],
  ["unspecified", "Lax"],
] as const)(
  "maps %s to %s and preserves the persistent cookie's expiry",
  ([sameSite, expected]) => {
    const cookie = { ...PREFERENCE, session: false, expirationDate: 1800000000, sameSite };
    expect(appSessionCookiesOf([cookie], ["example.com"])).toMatchObject([
      { sameSite: expected, expires: cookie.expirationDate },
    ]);
  },
);

const PREFERENCE: chrome.cookies.Cookie = {
  domain: "example.com",
  name: "theme",
  value: "light",
  path: "/settings",
  hostOnly: false,
  httpOnly: false,
  sameSite: "lax",
  secure: true,
  session: true,
  storeId: "0",
};
