import {
  startFakeConnectors,
  startFakeGoogle,
  type RunningFakeConnectors,
  type RunningFakeGoogle,
} from "@broccoli-access/fake-apps";
import { inject, test as baseTest } from "vitest";

import { connectDatabase, type Orm, type Transact } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import { pendingDisable } from "./accountChanges";
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
 * each test. Pages hold at most three people, so scanning all 42 crosses pages and Ana's
 * manager David arrives on a later page. A test registers its redirect address,
 * with the fake's `POST /_fake/clients`. `fakeConnectors` is the fake connectors container with
 * Acme's Slack and Linear, fresh for each test and answering without delay.
 */
export const test = baseTest.extend<{
  env: TestEnv;
  orm: Orm;
  databaseUrl: string;
  seed: TestSeed;
  transact: Transact;
  fakeGoogle: RunningFakeGoogle;
  fakeConnectors: RunningFakeConnectors;
}>({
  env: async ({ fakeGoogle }, use) => {
    const env = await TestEnv.start({ googleUrl: fakeGoogle.url });
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
  fakeConnectors: async ({ fakeGoogle }, use) => {
    const fake = await startFakeConnectors({ delayMs: 0, googleUrl: fakeGoogle.url });
    try {
      await use(fake);
    } finally {
      await fake.stop();
    }
  },
  // eslint-disable-next-line no-empty-pattern -- Vitest reads fixture dependencies from this pattern.
  fakeGoogle: async ({}, use) => {
    const fake = await startFakeGoogle({ maxPageSize: 3 });
    try {
      await use(fake);
    } finally {
      await fake.stop();
    }
  },
});

/** A real API with both the directory and the connectors container. */
export const connectorTest = test.extend<{ env: TestEnv }>({
  env: async ({ fakeGoogle, fakeConnectors }, use) => {
    const env = await TestEnv.start({
      googleUrl: fakeGoogle.url,
      connectorsUrl: fakeConnectors.url,
    });
    try {
      await use(env);
    } finally {
      await env.stop();
    }
  },
});

export const pendingDisableTest = test.extend<{
  pending: Awaited<ReturnType<typeof pendingDisable>>;
}>({
  pending: async ({ orm, seed, fakeConnectors }, use) => {
    await use(await pendingDisable(orm, seed, fakeConnectors.url));
  },
});
