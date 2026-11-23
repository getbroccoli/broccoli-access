import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  ACCOUNTS_LIST_ANSWER,
  ACTION_RUN_ANSWER,
  CONNECTION_TEST_ANSWER,
  CONNECTOR_CALLS,
  CONNECTOR_ERROR_ANSWER,
  CONNECTOR_ERROR_CODES,
  CONNECTION_UPDATE,
  type AccountAction,
  type AccountStatus,
  type Connection,
  type ConnectorCall,
  type ConnectorErrorCode,
  type ListedAccount,
} from "../connectorCalls.js";
import { CONNECTOR_MANIFEST, RUNTIME_KINDS, type RuntimeKind } from "../connectorManifest.js";

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
  /**
   * Puts the fake app behind the container at `url` back to its seed before each check: the
   * member active, the connection's credentials working, and no error waiting.
   */
  reset: (url: string) => Promise<void>;
  /**
   * The errors the connector can never give, each with a one-line reason; their checks show as
   * skipped. `owner_browser_lost` only for a connector without the `owner_browser` runtime.
   */
  cannotCause?: Partial<Record<(typeof OPTIONAL_ERROR_CODES)[number], string>>;
}

/**
 * The contract's conformance suite: Vitest tests that check each fixture's connector in the
 * containers at `urls`. Every connector must list the `server` runtime, where the suite calls it,
 * and the suite keeps each connection as the core does, applying the updates answers carry.
 */
export function describeConnectorConformance({ urls, fixtures }: ConformanceOptions): void {
  const [url, otherUrl] = urls;
  // The checks share the containers and reset their apps, so they never run concurrently.
  describe("container conformance", { timeout: NO_CHECK_TIMEOUT, concurrent: false }, () => {
    it("has a fixture for every connector in a manifest that matches its schema", async () => {
      const manifest = CONNECTOR_MANIFEST.parse(await getManifest(url));

      const keys = manifest.connectors.map(({ key }) => key);
      expect(fixtures.map(({ connector }) => connector).toSorted()).toEqual(keys.toSorted());
    });
  });
  for (const fixture of fixtures) {
    describe(
      `${fixture.connector} conformance`,
      { timeout: NO_CHECK_TIMEOUT, concurrent: false },
      () => {
        beforeEach(() => withinDeadline(fixture.reset(url), "the fixture's reset"));
        it("answers a connection test that matches its schema", () => startFlow(url, fixture));
        it("lists members on pages that match their schema, the fixture's member among them", () =>
          checkList(url, fixture));
        it("changes the member once when an action repeats, and reports the status read afterwards", () =>
          checkRepeatedActions(url, fixture));
        // A check, not a throw while collecting: Vitest would then skip the caller's afterAll(stop).
        if (fixture.cannotCause !== undefined)
          it("lists in cannotCause only errors its connector can never give, each with a one-line reason", () =>
            checkCannotCause(url, fixture));
        it.for(CONNECTOR_ERROR_CODES)(
          "answers %s, when the fixture causes it, as that error",
          (code, { skip }) => {
            const reason = cannotCauseReason(fixture, code);
            if (reason !== undefined) skip(`${fixture.connector} cannot cause ${code}: ${reason}`);
            return checkError(url, fixture, code);
          },
        );
        it("answers a runtime the connector does not list with HTTP 400", () =>
          checkUnlistedRuntimes(url, fixture));
        it("gives the same answers from two containers of the same image, apart from renewed secrets", async () => {
          expect(await answersOf(otherUrl, fixture)).toEqual(await answersOf(url, fixture));
        });
      },
    );
  }
}

/** A connector answers within 90 seconds (contract "Answers"). */
const CALL_TIMEOUT_MS = 90_000;

/** Each call and fixture step has its own deadline, so a check that makes many needs none. */
const NO_CHECK_TIMEOUT = 0;

/** A fixture talks to a fake app on the same machine, so it gets a connector call's time too. */
const FIXTURE_TIMEOUT_MS = CALL_TIMEOUT_MS;

/** A paging loop that never ends is a failure, not a hang. */
const MAX_PAGES = 1_000;

const SERVER = { kind: "server" } as const;

/** The errors only some connectors meet: a check that only a robot's page shows, and a lost owner's browser. */
const OPTIONAL_ERROR_CODES = [
  "blocked_by_check",
  "owner_browser_lost",
] as const satisfies readonly ConnectorErrorCode[];

/** Any character that ends a line, which would break a one-line skip note. */
const LINE_BREAK = /[\n\r\u2028\u2029]/;

/** An address that answers nothing: the suite never drives an owner's browser. */
const UNUSED_BROWSER_URL = "ws://127.0.0.1:9/conformance";

const ANY_ANSWER = z.union([
  CONNECTION_TEST_ANSWER,
  ACCOUNTS_LIST_ANSWER,
  ACTION_RUN_ANSWER,
  CONNECTOR_ERROR_ANSWER,
]);

const UPDATING_ANSWER = z.object({ connection: CONNECTION_UPDATE.optional() });

/** One connection used for a series of calls, as the core keeps it between them. */
interface Flow {
  url: string;
  fixture: ConnectorFixture;
  connection: Connection;
}

async function checkList(url: string, fixture: ConnectorFixture): Promise<void> {
  const [flow] = await startFlow(url, fixture);

  const sourceKeys = (await listAll(flow)).map(({ sourceKey }) => sourceKey);

  expect(new Set(sourceKeys).size).toBe(sourceKeys.length);
  expect(sourceKeys).toContain(fixture.member.sourceKey);
}

async function checkRepeatedActions(url: string, fixture: ConnectorFixture): Promise<void> {
  const [flow] = await startFlow(url, fixture);
  const run = (action: AccountAction, changed: boolean, status: AccountStatus) =>
    expectAction(flow, action, { changed, status });

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
  const [flow] = await startFlow(url, fixture);
  await withinDeadline(fixture.causeError(url, code), "the fixture's causeError");

  const answer = await send(flow, "actions/run", actionFields(fixture, "suspend"));

  expect(CONNECTOR_ERROR_ANSWER.parse(answer).error.code).toBe(code);
}

/**
 * Every key of `cannotCause`, since its type lets through the extra keys of an object built
 * elsewhere; and a connector that runs in the owner's browser can lose it, so it must cause that.
 */
async function checkCannotCause(url: string, fixture: ConnectorFixture): Promise<void> {
  const allowed = OPTIONAL_ERROR_CODES.join(" and ");
  for (const [code, reason] of Object.entries(fixture.cannotCause ?? {})) {
    expect(OPTIONAL_ERROR_CODES, `cannotCause may list only ${allowed}, not ${code}`).toContain(
      code,
    );
    expect(isOneLineText(reason), `cannotCause needs a one-line reason for ${code}`).toBe(true);
  }
  if (cannotCauseReason(fixture, "owner_browser_lost") === undefined) return;
  const runtimes = await runtimesOf(url, fixture.connector);
  const message = `${fixture.connector} lists the owner_browser runtime, so its fixture must cause owner_browser_lost, not list it in cannotCause`;
  expect(runtimes, message).not.toContain("owner_browser");
}

/** Why the fixture says its connector cannot cause `code`, if it says so. */
function cannotCauseReason(fixture: ConnectorFixture, code: string): string | undefined {
  return Object.entries(fixture.cannotCause ?? {}).find(([listed]) => listed === code)?.[1];
}

/** A plain JavaScript fixture may pass anything, so the type is checked too. */
function isOneLineText(text: unknown): text is string {
  return typeof text === "string" && text.trim() !== "" && !LINE_BREAK.test(text);
}

/** Each call as it would succeed, with only its runtime changed. */
async function checkUnlistedRuntimes(url: string, fixture: ConnectorFixture): Promise<void> {
  const listed = await runtimesOf(url, fixture.connector);
  const [flow] = await startFlow(url, fixture);

  for (const runtime of unlistedRuntimes(listed)) {
    for (const path of CONNECTOR_CALLS) {
      const body = { ...requestOf(flow, path), runtime };
      expect((await post(url, path, body)).status, `${path} on ${runtime.kind}`).toBe(400);
    }
  }
}

async function expectAction(
  flow: Flow,
  action: AccountAction,
  expected: { changed: boolean; status: AccountStatus },
): Promise<void> {
  const answer = ACTION_RUN_ANSWER.parse(
    await send(flow, "actions/run", actionFields(flow.fixture, action)),
  );
  const listed = (await listAll(flow)).find(
    ({ sourceKey }) => sourceKey === flow.fixture.member.sourceKey,
  );

  expect({ changed: answer.changed, status: answer.account.values.status }).toEqual(expected);
  expect(answer.account.sourceKey).toBe(flow.fixture.member.sourceKey);
  expect(listed?.values.status).toBe(expected.status);
}

/** Every answer a freshly reset app gives, each a success, without the secrets a connection renews. */
async function answersOf(url: string, fixture: ConnectorFixture): Promise<unknown[]> {
  await withinDeadline(fixture.reset(url), "the fixture's reset");
  const manifest = await getManifest(url);
  const [flow, testAnswer] = await startFlow(url, fixture);
  const pages = await listPages(flow);
  const action = await send(flow, "actions/run", actionFields(fixture, "suspend"));
  expect(ACTION_RUN_ANSWER.safeParse(action).error, "the action's answer").toBeUndefined();
  return [manifest, testAnswer, ...pages, action].map(withoutRenewedSecrets);
}

/** A connection that passed its test, with the settings the test found, and the test's answer. */
async function startFlow(url: string, fixture: ConnectorFixture): Promise<[Flow, unknown]> {
  const connection = await withinDeadline(fixture.connection(url), "the fixture's connection");
  const flow = { url, fixture, connection };
  const answer = await send(flow, "connections/test", {});
  expect(CONNECTION_TEST_ANSWER.safeParse(answer).error, "the test's answer").toBeUndefined();
  return [flow, answer];
}

async function listAll(flow: Flow): Promise<ListedAccount[]> {
  const pages = await listPages(flow);
  return pages.flatMap((page) => ACCOUNTS_LIST_ANSWER.parse(page).accounts);
}

async function listPages(flow: Flow): Promise<unknown[]> {
  const pages: unknown[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await send(flow, "accounts/list", { cursor });
    pages.push(page);
    cursor = ACCOUNTS_LIST_ANSWER.parse(page).nextCursor;
    expect(cursors.has(cursor ?? ""), "a nextCursor seen before").toBe(false);
    if (cursor !== null) cursors.add(cursor);
  } while (cursor !== null && pages.length < MAX_PAGES);
  expect(cursor, "the last page's nextCursor").toBeNull();
  return pages;
}

/** Calls on the server runtime and keeps the connection update a successful answer carries. */
async function send(flow: Flow, path: ConnectorCall, fields: object): Promise<unknown> {
  const answer = await call(flow.url, path, { ...requestOf(flow, "connections/test"), ...fields });
  const update = isError(answer) ? undefined : UPDATING_ANSWER.safeParse(answer).data?.connection;
  // Each object an update carries replaces the stored one (contract "The connection").
  if (update !== undefined) flow.connection = { ...flow.connection, ...update };
  return answer;
}

/** A request for `path` that the connector would answer. */
function requestOf(flow: Flow, path: ConnectorCall): object {
  const request = {
    connector: flow.fixture.connector,
    connection: flow.connection,
    runtime: SERVER,
  };
  if (path === "accounts/list") return { ...request, cursor: null };
  if (path === "actions/run") return { ...request, ...actionFields(flow.fixture, "suspend") };
  return request;
}

function actionFields(fixture: ConnectorFixture, action: AccountAction) {
  return { action, account: fixture.member };
}

/** Every runtime the connector does not list, and one no version of the contract has. */
function unlistedRuntimes(listed: readonly string[]): { kind: string; url?: string }[] {
  const unlisted = RUNTIME_KINDS.filter((kind) => !listed.includes(kind));
  return [
    ...unlisted.map((kind) => (kind === "server" ? SERVER : { kind, url: UNUSED_BROWSER_URL })),
    { kind: "unknown_runtime" },
  ];
}

/**
 * A call's answer, which must come with HTTP 200 and match one of the contract's answers: an
 * error alone, with a listed code, or a success without an error.
 */
async function call(url: string, path: string, body: object): Promise<unknown> {
  const response = await post(url, path, body);
  expect(response.status, `HTTP status of ${path}`).toBe(200);
  const answer: unknown = await response.json();
  expect(ANY_ANSWER.safeParse(answer).error, `answer of ${path}`).toBeUndefined();
  // The suite never sends APP_CALLS_HEADER, so the app's calls must stay out of every answer.
  expect(answer, `app calls in the answer of ${path}`).not.toHaveProperty("appCalls");
  if (isError(answer)) {
    expect(Object.keys(answer), `error answer of ${path}`).toEqual(["error"]);
    expect(CONNECTOR_ERROR_CODES, `error code of ${path}`).toContain(answer.error.code);
  }
  return answer;
}

function isError(answer: unknown): answer is { error: { code: unknown } } {
  return typeof answer === "object" && answer !== null && "error" in answer;
}

/** Fails a fixture step that never settles, as a call past its deadline fails. */
async function withinDeadline<T>(step: Promise<T>, name: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${name} took over ${FIXTURE_TIMEOUT_MS} ms`)),
      FIXTURE_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([step, late]);
  } finally {
    clearTimeout(timer);
  }
}

async function runtimesOf(url: string, connector: string): Promise<RuntimeKind[]> {
  const manifest = CONNECTOR_MANIFEST.parse(await getManifest(url));
  return manifest.connectors.find(({ key }) => key === connector)?.runtimes ?? [];
}

async function getManifest(url: string): Promise<unknown> {
  const response = await fetch(`${url}/v1/connectors`, {
    redirect: "manual",
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  expect(response.status, "HTTP status of the manifest").toBe(200);
  const manifest: unknown = await response.json();
  expect(manifest, "app calls in the manifest").not.toHaveProperty("appCalls");
  return manifest;
}

/** Never follows a redirect: it would leave the container, and the contract answers with 200. */
function post(url: string, path: string, body: object): Promise<Response> {
  return fetch(`${url}/v1/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
}

/** Two containers may renew a session differently; the answers about the app must still agree. */
function withoutRenewedSecrets(answer: unknown): unknown {
  if (typeof answer !== "object" || answer === null || !("connection" in answer)) return answer;
  const { connection, ...rest } = answer as { connection: Record<string, unknown> };
  const kept = Object.fromEntries(Object.entries(connection).filter(([key]) => key !== "secrets"));
  return Object.keys(kept).length === 0 ? rest : { ...rest, connection: kept };
}
