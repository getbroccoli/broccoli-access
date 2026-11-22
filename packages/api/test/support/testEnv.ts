import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ACME } from "@broccoli-access/fake-apps";
import { eq, sql } from "drizzle-orm";
import { inject } from "vitest";

import { session, user } from "../../src/core/auth";
import { connectDatabase, type Database } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import type { RunningServer } from "../../src/core/server";
import { createTestDatabase, type TestDatabase } from "./testDatabases";
import { registerGoogleRedirect, consentAtGoogle } from "./googleConsent";
import { TestSeed } from "./testSeed";
import { createBrowser, type Browser } from "./browser";
import { startTestServer, waitForStartup, type TestServerOptions } from "./testServer";

export type TestEnvOptions = Omit<TestServerOptions, "dataDir"> & { googleUrl?: string };

export const TEST_OWNER = { email: "admin@acme.example" };

export interface SignedInOwner {
  browser: Browser;
  user: { id: string; email: string };
}

/**
 * One Broccoli Access for one test: its own database, data folder and a ready server. The
 * entry point to the other test tools.
 */
export class TestEnv {
  /** Creates test data through the use cases, on this environment's database. */
  readonly seed: TestSeed;
  private readonly database: Database;

  private constructor(
    readonly db: TestDatabase,
    readonly dataDir: string,
    private server: RunningServer,
    private readonly options: TestEnvOptions,
  ) {
    this.database = connectDatabase(db.url, createLogger("silent"));
    this.seed = new TestSeed(this.database.orm);
  }

  /** Starts a new environment and waits until it is ready. */
  static async start(options: TestEnvOptions = {}): Promise<TestEnv> {
    const db = await createTestDatabase(inject("testRun"));
    const dataDir = await mkdtemp(join(tmpdir(), "broccoli-access-data-"));
    return new TestEnv(db, dataDir, await startReady(db, dataDir, options), options);
  }

  get url(): string {
    return this.server.url;
  }

  /** A new browser with its own cookies, following this server across restarts. */
  browser(): Browser {
    return createBrowser(() => this.url);
  }

  /** Sets up the owner and returns a browser signed in as them. */
  async signInAsOwner(): Promise<SignedInOwner> {
    assert(this.options.googleUrl, "TestEnv needs a fake Google for owner sign-in");
    await registerGoogleRedirect(this.options.googleUrl, this.url);
    const browser = await this.startSetup();
    const response = await browser.post("/api/google/connect", ACME.oauthClient);
    assert.equal(response.status, 200, await response.clone().text());
    const { authorizationUrl } = (await response.json()) as { authorizationUrl: string };
    const callback = await consentAtGoogle(authorizationUrl);
    const finished = await browser.getManual(callback.href);
    assert.equal(finished.headers.get("location"), "/setup/scan");
    const me = await browser.graphql("{ me { id email } }");
    const { data } = (await me.json()) as { data: { me: SignedInOwner["user"] | null } };
    assert(data.me);
    return { browser, user: data.me };
  }

  /** A new browser holding setup. */
  async startSetup(): Promise<Browser> {
    const browser = this.browser();
    const started = await browser.post("/api/auth/setup/start", undefined);
    if (started.status !== 200) {
      throw new Error(`Setup start failed with ${started.status}: ${await started.text()}`);
    }
    const claimed = await browser.post("/api/auth/setup/start", undefined);
    assert.equal(claimed.status, 200, await claimed.clone().text());
    assert.deepEqual(await claimed.json(), { holder: "you" });
    return browser;
  }

  async createUser(email: string): Promise<void> {
    await this.database.orm.insert(user).values({ id: randomUUID(), name: "User", email });
  }

  async changeUserName(email: string, name: string): Promise<void> {
    await this.database.orm.update(user).set({ name }).where(eq(user.email, email));
  }

  async userIdsForEmail(email: string): Promise<string[]> {
    const users = await this.database.orm
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email));
    return users.map(({ id }) => id);
  }

  async changeUserEmail(userId: string, email: string): Promise<void> {
    await this.database.orm.update(user).set({ email }).where(eq(user.id, userId));
  }

  async expireSessionsIn(days: number): Promise<void> {
    await this.database.orm
      .update(session)
      .set({ expiresAt: sql`now() + ${days} * interval '1 day'` });
  }

  /** Stops the server and starts a new one on the same database and data folder. */
  async restart(options: TestEnvOptions = {}): Promise<void> {
    await this.server.stop();
    this.server = await startReady(this.db, this.dataDir, { ...this.options, ...options });
  }

  async stop(): Promise<void> {
    await this.database.close();
    await this.server.stop();
    await this.db.drop();
    await rm(this.dataDir, { recursive: true, force: true });
  }
}

async function startReady(
  db: TestDatabase,
  dataDir: string,
  options: TestEnvOptions,
): Promise<RunningServer> {
  const { googleUrl, ...serverOptions } = options;
  const server = await startTestServer(db.url, {
    ...(googleUrl
      ? {
          googleOpenIdConfigurationUrl: `${googleUrl}/.well-known/openid-configuration`,
          googleAdminApiUrl: googleUrl,
        }
      : {}),
    ...serverOptions,
    dataDir,
  });
  const readiness = await waitForStartup(server);
  if (readiness.status !== "ready") {
    await server.stop();
    throw new Error(`Test environment did not become ready: ${JSON.stringify(readiness)}`);
  }
  return server;
}
