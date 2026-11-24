import { beforeEach, describe, expect, it } from "vitest";

import {
  ACTION_RUN_ANSWER,
  CONNECTOR_ERROR_ANSWER,
  CONNECTOR_ERROR_CODES,
  CONNECTOR_CALLS,
  type AccountAction,
  type AccountStatus,
  type Connection,
  type ConnectorErrorCode,
} from "../connectorCalls.js";
import { CONNECTOR_MANIFEST } from "../connectorManifest.js";
import { describeInviteConformance } from "./describeInviteConformance.js";
import { describeRemoveConformance } from "./describeRemoveConformance.js";
import { describeSignInConformance, SIGN_IN_ERROR_CODES } from "./describeSignInConformance.js";
import {
  actionFields,
  getManifest,
  listAll,
  listPages,
  post,
  requestOf,
  runtimesOf,
  send,
  startFlow,
  withinDeadline,
  unlistedRuntimes,
  type Flow,
} from "./flow.js";

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
  /**
   * An email with no member and no pending invitation, which the suite invites; a connector that
   * lists `invite` needs it.
   */
  invitee?: { email: string };
  /** An active member that the suite removes; a connector that lists `remove` needs it. */
  memberToRemove?: { sourceKey: string; email: string };
  /** A connector that lists `sign_in` needs it. */
  signIn?: {
    /**
     * The integration user, which `reset` leaves invited as an admin, for example with an
     * `actions/run` invite with the admin role through another connection.
     */
    integrationUser: { email: string; password: string; totpSecret: string };
    /** Makes the next `connections/sign-in` through the container at `url` answer with `code`. */
    causeError: (url: string, code: (typeof SIGN_IN_ERROR_CODES)[number]) => Promise<void>;
  };
  /** Makes the next `actions/run` call through the container at `url` fail with `code`. */
  causeError: (url: string, code: ActionErrorCode) => Promise<void>;
  /**
   * Puts the fake app behind the container at `url` back to its seed before each check: the
   * member active, the member to remove back, no invitation for the invitee, the integration user
   * invited as an admin, the connection's credentials working, and no error waiting.
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
        describeInviteConformance(url, fixture);
        describeRemoveConformance(url, fixture);
        describeSignInConformance(url, fixture);
        // A check, not a throw while collecting: Vitest would then skip the caller's afterAll(stop).
        if (fixture.cannotCause !== undefined)
          it("lists in cannotCause only errors its connector can never give, each with a one-line reason", () =>
            checkCannotCause(url, fixture));
        it.for(ACTION_ERROR_CODES)(
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

/** Each call and fixture step has its own deadline, so a check that makes many needs none. */
const NO_CHECK_TIMEOUT = 0;

/** Every error an action can answer: `not_invited` comes only from the sign-in. */
const ACTION_ERROR_CODES = CONNECTOR_ERROR_CODES.filter(
  (code): code is ActionErrorCode => code !== "not_invited",
);

type ActionErrorCode = Exclude<ConnectorErrorCode, "not_invited">;

/** The errors only some connectors meet: a check that only a robot's page shows, and a lost owner's browser. */
const OPTIONAL_ERROR_CODES = [
  "blocked_by_check",
  "owner_browser_lost",
] as const satisfies readonly ConnectorErrorCode[];

/** Any character that ends a line, which would break a one-line skip note. */
const LINE_BREAK = /[\n\r\u2028\u2029]/;

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
  code: ActionErrorCode,
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

  expect({ changed: answer.changed, status: answer.account?.values.status }).toEqual(expected);
  expect(answer.account?.sourceKey).toBe(flow.fixture.member.sourceKey);
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

/** Two containers may renew a session differently; the answers about the app must still agree. */
function withoutRenewedSecrets(answer: unknown): unknown {
  if (typeof answer !== "object" || answer === null || !("connection" in answer)) return answer;
  const { connection, ...rest } = answer as { connection: Record<string, unknown> };
  const kept = Object.fromEntries(Object.entries(connection).filter(([key]) => key !== "secrets"));
  return Object.keys(kept).length === 0 ? rest : { ...rest, connection: kept };
}
