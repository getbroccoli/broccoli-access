import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  ACCOUNTS_LIST_ANSWER,
  ACTION_RUN_ANSWER,
  CONNECTION_TEST_ANSWER,
  CONNECTOR_CALLS,
  CONNECTOR_ERROR_ANSWER,
  CONNECTOR_ERROR_CODES,
  type AccountAction,
  type AccountStatus,
  type Connection,
  type ConnectorErrorCode,
  type ListedAccount,
} from "./connectorCalls.js";
import { CONNECTOR_MANIFEST, RUNTIME_KINDS } from "./connectorManifest.js";

export interface ConformanceOptions {
  /**
   * Two containers started from the same image, each with a read-only root file system, as
   * `startContainers` starts them.
   */
  urls: readonly [string, string];
  fixtures: readonly ConnectorFixture[];
}

/** What the suite needs to check one connector against its fake app. */
export interface ConnectorFixture {
  /** The connector's key in the manifest. */
  connector: string;
  /** A connection to the connector's fake app, for calls to the container at `url`. */
  connection: (url: string) => Promise<Connection>;
  /** An active member that the suite suspends and reactivates. */
  member: { sourceKey: string; email: string };
  /** Makes the next `actions/run` call through the container at `url` fail with `code`. */
  causeError: (url: string, code: ConnectorErrorCode) => Promise<void>;
  /** Puts the fake app behind the container at `url` back to its seed; runs before each check. */
  reset: (url: string) => Promise<void>;
}

/**
 * The contract's conformance suite: Vitest tests that check each fixture's connector in the
 * containers at `urls`, calling them on the `server` runtime.
 */
export function describeConnectorConformance({ urls, fixtures }: ConformanceOptions): void {
  const [url, otherUrl] = urls;
  for (const fixture of fixtures) {
    describe(`${fixture.connector} conformance`, { timeout: CHECK_TIMEOUT_MS }, () => {
      beforeEach(async () => {
        await fixture.reset(url);
        await fixture.reset(otherUrl);
      });
      it("lists the connector in a manifest that matches its schema", () =>
        checkManifest(url, fixture));
      it("answers a connection test that matches its schema", () =>
        checkConnectionTest(url, fixture));
      it("lists every member on pages that match their schema", () => checkList(url, fixture));
      it("changes the member once when an action repeats, and reports the status read afterwards", () =>
        checkRepeatedActions(url, fixture));
      it.for(CONNECTOR_ERROR_CODES)("answers %s as a connector error", (code) =>
        checkError(url, fixture, code),
      );
      it("answers a runtime the connector does not list with HTTP 400", () =>
        checkUnlistedRuntimes(url, fixture));
      it("gives the same answers from two containers of the same image", async () => {
        expect(await answersOf(otherUrl, fixture)).toEqual(await answersOf(url, fixture));
      });
    });
  }
}

/** Each check makes a few calls, and the contract gives a call up to 120 seconds. */
const CHECK_TIMEOUT_MS = 10 * 60_000;

/** The core reads no answer within this time as the container failing. */
const CALL_TIMEOUT_MS = 120_000;

/** A paging loop that never ends is a failure, not a hang. */
const MAX_PAGES = 1_000;

const SERVER = { kind: "server" } as const;

/** An address that answers nothing: the suite never drives an owner's browser. */
const UNUSED_BROWSER_URL = "ws://127.0.0.1:9/conformance";

const ANY_ANSWER = z.union([
  CONNECTION_TEST_ANSWER,
  ACCOUNTS_LIST_ANSWER,
  ACTION_RUN_ANSWER,
  CONNECTOR_ERROR_ANSWER,
]);

async function checkManifest(url: string, fixture: ConnectorFixture): Promise<void> {
  const manifest = CONNECTOR_MANIFEST.parse(await getManifest(url));

  expect(manifest.connectors.map(({ key }) => key)).toContain(fixture.connector);
}

async function checkConnectionTest(url: string, fixture: ConnectorFixture): Promise<void> {
  const answer = await call(url, "connections/test", {
    connector: fixture.connector,
    connection: await fixture.connection(url),
    runtime: SERVER,
  });

  expect(CONNECTION_TEST_ANSWER.safeParse(answer).error).toBeUndefined();
}

async function checkList(url: string, fixture: ConnectorFixture): Promise<void> {
  const accounts = await listAll(url, fixture, await fixture.connection(url));

  const sourceKeys = accounts.map(({ sourceKey }) => sourceKey);
  expect(new Set(sourceKeys).size).toBe(sourceKeys.length);
  expect(sourceKeys).toContain(fixture.member.sourceKey);
}

async function checkRepeatedActions(url: string, fixture: ConnectorFixture): Promise<void> {
  const connection = await fixture.connection(url);
  const run = (action: AccountAction, changed: boolean, status: AccountStatus) =>
    expectAction(url, fixture, connection, action, { changed, status });

  await run("suspend", true, "suspended");
  await run("suspend", false, "suspended");
  await run("reactivate", true, "active");
  await run("reactivate", false, "active");
}

async function checkError(
  url: string,
  fixture: ConnectorFixture,
  code: ConnectorErrorCode,
): Promise<void> {
  const connection = await fixture.connection(url);
  await fixture.causeError(url, code);

  const answer = await call(url, "actions/run", actionRequest(fixture, connection, "suspend"));

  expect(CONNECTOR_ERROR_ANSWER.parse(answer).error.code).toBe(code);
}

async function checkUnlistedRuntimes(url: string, fixture: ConnectorFixture): Promise<void> {
  const manifest = CONNECTOR_MANIFEST.parse(await getManifest(url));
  const listed = manifest.connectors.find(({ key }) => key === fixture.connector)?.runtimes;
  const connection = await fixture.connection(url);

  for (const runtime of unlistedRuntimes(listed ?? [])) {
    for (const path of CONNECTOR_CALLS) {
      const body = { ...actionRequest(fixture, connection, "suspend"), cursor: null, runtime };
      expect((await post(url, path, body)).status, `${path} on ${runtime.kind}`).toBe(400);
    }
  }
}

async function expectAction(
  url: string,
  fixture: ConnectorFixture,
  connection: Connection,
  action: AccountAction,
  expected: { changed: boolean; status: AccountStatus },
): Promise<void> {
  const answer = ACTION_RUN_ANSWER.parse(
    await call(url, "actions/run", actionRequest(fixture, connection, action)),
  );
  const listed = (await listAll(url, fixture, connection)).find(
    ({ sourceKey }) => sourceKey === fixture.member.sourceKey,
  );

  expect({ changed: answer.changed, status: answer.account.values.status }).toEqual(expected);
  expect(answer.account.sourceKey).toBe(fixture.member.sourceKey);
  expect(listed?.values.status).toBe(expected.status);
}

/** Every answer a fresh container gives for the fixture, without the secrets a connection renews. */
async function answersOf(url: string, fixture: ConnectorFixture): Promise<unknown[]> {
  await fixture.reset(url);
  const connection = await fixture.connection(url);
  const answers = [
    await getManifest(url),
    await call(url, "connections/test", {
      connector: fixture.connector,
      connection,
      runtime: SERVER,
    }),
    ...(await listPages(url, fixture, connection)),
    await call(url, "actions/run", actionRequest(fixture, connection, "suspend")),
  ];
  return answers.map(withoutRenewedSecrets);
}

async function listAll(
  url: string,
  fixture: ConnectorFixture,
  connection: Connection,
): Promise<ListedAccount[]> {
  const pages = await listPages(url, fixture, connection);
  return pages.flatMap((page) => ACCOUNTS_LIST_ANSWER.parse(page).accounts);
}

async function listPages(
  url: string,
  fixture: ConnectorFixture,
  connection: Connection,
): Promise<unknown[]> {
  const pages: unknown[] = [];
  let cursor: string | null = null;
  do {
    const page = await call(url, "accounts/list", {
      connector: fixture.connector,
      connection,
      runtime: SERVER,
      cursor,
    });
    pages.push(page);
    cursor = ACCOUNTS_LIST_ANSWER.parse(page).nextCursor;
  } while (cursor !== null && pages.length < MAX_PAGES);
  expect(cursor, "the last page's nextCursor").toBeNull();
  return pages;
}

function actionRequest(fixture: ConnectorFixture, connection: Connection, action: AccountAction) {
  return {
    connector: fixture.connector,
    connection,
    runtime: SERVER,
    action,
    account: fixture.member,
  };
}

/** Every runtime the connector does not list, and one no version of the contract has. */
function unlistedRuntimes(listed: readonly string[]): { kind: string; url?: string }[] {
  const unlisted = RUNTIME_KINDS.filter((kind) => !listed.includes(kind));
  return [
    ...unlisted.map((kind) => (kind === "server" ? SERVER : { kind, url: UNUSED_BROWSER_URL })),
    { kind: "unknown_runtime" },
  ];
}

/** A call's answer, which must come with HTTP 200 and match one of the contract's answers. */
async function call(url: string, path: string, body: object): Promise<unknown> {
  const response = await post(url, path, body);
  expect(response.status, `HTTP status of ${path}`).toBe(200);
  const answer: unknown = await response.json();
  expect(ANY_ANSWER.safeParse(answer).error, `answer of ${path}`).toBeUndefined();
  return answer;
}

async function getManifest(url: string): Promise<unknown> {
  const response = await fetch(`${url}/v1/connectors`, {
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  expect(response.status, "HTTP status of the manifest").toBe(200);
  return response.json();
}

function post(url: string, path: string, body: object): Promise<Response> {
  return fetch(`${url}/v1/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
}

/** Two containers may renew a session differently; the answers about the app must still agree. */
function withoutRenewedSecrets(answer: unknown): unknown {
  if (typeof answer !== "object" || answer === null || !("connection" in answer)) return answer;
  const { connection, ...rest } = answer as { connection: Record<string, unknown> };
  return { ...rest, connection: { ...connection, secrets: undefined } };
}
