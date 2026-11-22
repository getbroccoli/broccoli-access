import { startFakeGoogle, type RunningFakeGoogle } from "@broccoli-access/fake-apps";
import { inject, test as baseTest } from "vitest";

import { connectDatabase, type Orm, type Transact } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import { createTestDatabase } from "./testDatabases";
import { TestEnv } from "./testEnv";
import { TestSeed } from "./testSeed";
import { testTransactor } from "./testTransactor";

/**
 * Vitest's `test` with fixtures, each created only for the tests that use it:
 * `env`, a running Broccoli Access for end-to-end tests (seed it with `env.seed`), and
 * `orm` and `seed`, a fresh migrated database for use-case integration tests (its
 * URL is `databaseUrl`), `transact`, transactions on `orm` whose events nobody
 * receives, and `fakeGoogle`, Google with the demo company Acme on a free local port, fresh for
 * each test. A test registers its server's redirect address, `<its origin>/api/google/callback`,
 * with the fake's `POST /_fake/clients`.
 */
export const test = baseTest.extend<{
  env: TestEnv;
  orm: Orm;
  databaseUrl: string;
  seed: TestSeed;
  transact: Transact;
  fakeGoogle: RunningFakeGoogle;
}>({
  // eslint-disable-next-line no-empty-pattern -- Vitest reads fixture dependencies from this pattern.
  env: async ({}, use) => {
    const env = await TestEnv.start();
    await use(env);
    await env.stop();
  },
  // eslint-disable-next-line no-empty-pattern -- Vitest reads fixture dependencies from this pattern.
  databaseUrl: async ({}, use) => {
    const testDatabase = await createTestDatabase(inject("testRun"));
    try {
      await use(testDatabase.url);
    } finally {
      await testDatabase.drop();
    }
  },
  orm: async ({ databaseUrl }, use) => {
    const database = connectDatabase(databaseUrl, createLogger("silent"));
    try {
      await use(database.orm);
    } finally {
      await database.close();
    }
  },
  seed: async ({ orm }, use) => {
    await use(new TestSeed(orm));
  },
  transact: async ({ orm }, use) => {
    await use(testTransactor(orm));
  },
  // eslint-disable-next-line no-empty-pattern -- Vitest reads fixture dependencies from this pattern.
  fakeGoogle: async ({}, use) => {
    const fake = await startFakeGoogle();
    try {
      await use(fake);
    } finally {
      await fake.stop();
    }
  },
});
