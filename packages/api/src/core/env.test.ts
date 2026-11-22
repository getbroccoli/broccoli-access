import { expect, it } from "vitest";

import { googleSettingsOffGoogle, loadEnv } from "./env";

it("defaults every optional setting", () => {
  const env = loadEnv({ DATABASE_URL: "postgres://broccoli_access@localhost/broccoli_access" });

  expect(env).toEqual({
    databaseUrl: "postgres://broccoli_access@localhost/broccoli_access",
    port: 3000,
    logLevel: "info",
    dataDir: "/data",
    googleOpenIdConfigurationUrl: "https://accounts.google.com/.well-known/openid-configuration",
    googleAdminApiUrl: "https://admin.googleapis.com",
  });
});

it.for([
  { name: "defaults", settings: {}, expected: [] },
  {
    name: "both URLs point to the fake",
    settings: {
      GOOGLE_OPENID_CONFIGURATION_URL: "http://fake-google:4000/.well-known/openid-configuration",
      GOOGLE_ADMIN_API_URL: "http://fake-google:4000",
    },
    expected: ["GOOGLE_OPENID_CONFIGURATION_URL", "GOOGLE_ADMIN_API_URL"],
  },
  {
    name: "only the Admin API URL points to the fake",
    settings: { GOOGLE_ADMIN_API_URL: "http://fake-google:4000" },
    expected: ["GOOGLE_ADMIN_API_URL"],
  },
])("identifies settings off Google when $name", ({ settings, expected }) => {
  const env = loadEnv({
    DATABASE_URL: "postgres://broccoli_access@localhost/broccoli_access",
    ...settings,
  });

  const offGoogle = googleSettingsOffGoogle(env);

  expect(offGoogle).toEqual(expected);
});

it("reads the public URL", () => {
  const env = loadEnv({
    DATABASE_URL: "postgres://broccoli_access@localhost/broccoli_access",
    SELF_HOSTED_PUBLIC_URL: "https://access.example.com",
  });

  expect(env.publicUrl).toBe("https://access.example.com");
});
