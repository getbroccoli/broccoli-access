import { expect, it } from "vitest";

import { loadEnv } from "./env";

it("defaults every optional setting", () => {
  const env = loadEnv({ DATABASE_URL: "postgres://broccoli_access@localhost/broccoli_access" });

  expect(env).toEqual({
    databaseUrl: "postgres://broccoli_access@localhost/broccoli_access",
    port: 3000,
    logLevel: "info",
    dataDir: "/data",
  });
});

it("reads the public URL", () => {
  const env = loadEnv({
    DATABASE_URL: "postgres://broccoli_access@localhost/broccoli_access",
    SELF_HOSTED_PUBLIC_URL: "https://access.example.com",
  });

  expect(env.publicUrl).toBe("https://access.example.com");
});
