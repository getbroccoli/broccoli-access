import { defineConfig } from "vitest/config";

// The conformance suite against the fake as a container image: `pnpm test:e2e` builds it.
export default defineConfig({
  test: { include: ["test/e2e/**/*.test.ts"] },
});
