import { beforeEach, describe, expect, it } from "vitest";

import {
  ACTION_RUN_ANSWER,
  CONNECTOR_ERROR_ANSWER,
  CONNECTOR_ERROR_CODES,
  type AccountStatus,
  type Connection,
  type ConnectorCall,
  type ConnectorErrorCode,
} from "../connectorCalls.js";
import { CONNECTOR_MANIFEST, type ConnectorDescription } from "../connectorManifest.js";
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
  skipUnlessListed,
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
  /** An active member that the suite suspends and reactivates, required when it lists those actions. */
  member?: { sourceKey: string; email: string };
  /**
   * An email with no member and no pending invitation, which the suite invites; a connector that
   * lists `invite` needs it and at least one listed member for the unchanged-invite check.
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
  /** Makes the next `suspend`, `invite` or `remove` call (the first listed), or `accounts/list` without one, fail with `code`. */
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
  let manifest: Promise<ConnectorDescription[]> | undefined;
  const readManifest = () =>
    (manifest ??= getManifest(url).then((raw) => CONNECTOR_MANIFEST.parse(raw).connectors));
  // The checks share the containers and reset their apps, so they never run concurrently.
  describe("container conformance", { timeout: NO_CHECK_TIMEOUT, concurrent: false }, () => {
    it("has a fixture for every connector in a manifest that matches its schema", async () => {
      const keys = (await readManifest()).map(({ key }) => key);
      expect(fixtures.map(({ connector }) => connector).toSorted()).toEqual(keys.toSorted());
    });
  });
  for (const fixture of fixtures) {
    describe(
      `${fixture.connector} conformance`,
      { timeout: NO_CHECK_TIMEOUT, concurrent: false },
      () => {
        let connector: Promise<ConnectorDescription | undefined> | undefined;
        const description = () =>
          (connector ??= readManifest().then((listed) =>
            listed.find(({ key }) => key === fixture.connector),
          ));
        beforeEach(() => withinDeadline(fixture.reset(url), "the fixture's reset"));
        it("answers a connection test that matches its schema", () => startFlow(url, fixture));
        it("lists members with unique keys on pages that match their schema", () =>
          checkList(url, fixture));
        it("changes the member once when suspend and reactivate repeat, and reports the status read afterwards", async ({
          skip,
        }) => {
          await skipUnlessListed(url, fixture, "suspend", skip);
          await checkRepeatedActions(url, fixture);
        });
        describeInviteConformance(url, fixture);
        describeRemoveConformance(url, fixture);
        describeSignInConformance(url, fixture);
        describeErrors(url, fixture, description);
        it("answers a runtime the connector does not list with HTTP 400", async () =>
          checkUnlistedRuntimes(url, fixture, await description()));
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

/** These errors name a target member or a refused change, neither of which a list requests. */
const ACTION_ONLY_ERRORS = new Set<ActionErrorCode>(["account_not_found", "not_allowed"]);
const MEMBER_ACTIONS = ["suspend", "remove"] as const;
const ERROR_ACTIONS = ["suspend", "invite", "remove"] as const;

/** The errors only some connectors meet: a check that only a robot's page shows, and a lost owner's browser. */
const OPTIONAL_ERROR_CODES = [
  "blocked_by_check",
  "owner_browser_lost",
] as const satisfies readonly ConnectorErrorCode[];

/** Any character that ends a line, which would break a one-line skip note. */
const LINE_BREAK = /[\n\r\u2028\u2029]/;

function describeErrors(
  url: string,
  fixture: ConnectorFixture,
  description: () => Promise<ConnectorDescription | undefined>,
): void {
  // A check, not a throw while collecting: Vitest would then skip the caller's afterAll(stop).
  if (fixture.cannotCause !== undefined)
    it("lists in cannotCause only errors its connector can never give, each with a one-line reason", () =>
      checkCannotCause(url, fixture));
  it.for(ACTION_ERROR_CODES)(
    "answers %s, when the fixture causes it, as that error",
    async (code, { skip }) => {
      const reason = cannotCauseReason(fixture, code);
      if (reason !== undefined) skip(`${fixture.connector} cannot cause ${code}: ${reason}`);
      const actions = code === "account_not_found" ? MEMBER_ACTIONS : ERROR_ACTIONS;
      const capabilities = (await description())?.capabilities;
      const action = actions.find((candidate) => capabilities?.includes(candidate));
      if (!action && ACTION_ONLY_ERRORS.has(code)) skip(`${code} applies only to actions`);
      return checkError(url, fixture, code, action && actionFields(fixture, action));
    },
  );
}

async function checkList(url: string, fixture: ConnectorFixture): Promise<void> {
  const [flow] = await startFlow(url, fixture);

  const sourceKeys = (await listAll(flow)).map(({ sourceKey }) => sourceKey);

  expect(new Set(sourceKeys).size).toBe(sourceKeys.length);
  if (fixture.member) expect(sourceKeys).toContain(fixture.member.sourceKey);
}

async function checkRepeatedActions(url: string, fixture: ConnectorFixture): Promise<void> {
  const [flow] = await startFlow(url, fixture);
  const member = fixture.member;
  expect(member, `${fixture.connector} lists suspend, so its fixture needs a member`).toBeDefined();
  const run = (action: "suspend" | "reactivate", changed: boolean, status: AccountStatus) =>
    expectAction(flow, { action, account: member! }, { changed, status });

  await run("suspend", true, "suspended");
  await run("suspend", false, "suspended");
  await run("reactivate", true, "active");
  await run("reactivate", false, "active");
}

async function checkError(
  url: string,
  fixture: ConnectorFixture,
  code: ActionErrorCode,
  action: ReturnType<typeof actionFields> | undefined,
): Promise<void> {
  const [flow] = await startFlow(url, fixture);
  await withinDeadline(fixture.causeError(url, code), "the fixture's causeError");

  const answer = action
    ? await send(flow, "actions/run", action)
    : await send(flow, "accounts/list", { cursor: null });

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
async function checkUnlistedRuntimes(
  url: string,
  fixture: ConnectorFixture,
  connector: ConnectorDescription | undefined,
): Promise<void> {
  const [flow] = await startFlow(url, fixture);
  const calls: [ConnectorCall, object][] = [
    ["connections/test", {}],
    ["accounts/list", { cursor: null }],
  ];
  // Invite has its own unlisted-runtime check.
  const action = MEMBER_ACTIONS.find((candidate) => connector?.capabilities.includes(candidate));
  if (action) calls.push(["actions/run", actionFields(fixture, action)]);

  for (const runtime of unlistedRuntimes(connector?.runtimes ?? [])) {
    for (const [path, fields] of calls) {
      const body = { ...requestOf(flow), ...fields, runtime };
      expect((await post(url, path, body)).status, `${path} on ${runtime.kind}`).toBe(400);
    }
  }
}

async function expectAction(
  flow: Flow,
  fields: { action: "suspend" | "reactivate"; account: { sourceKey: string; email: string } },
  expected: { changed: boolean; status: AccountStatus },
): Promise<void> {
  const answer = ACTION_RUN_ANSWER.parse(await send(flow, "actions/run", fields));
  const listed = (await listAll(flow)).find(
    ({ sourceKey }) => sourceKey === fields.account.sourceKey,
  );

  expect({ changed: answer.changed, status: answer.account?.values.status }).toEqual(expected);
  expect(answer.account?.sourceKey).toBe(fields.account.sourceKey);
  expect(listed?.values.status).toBe(expected.status);
}

/** Every answer a freshly reset app gives, each a success, without the secrets a connection renews. */
async function answersOf(url: string, fixture: ConnectorFixture): Promise<unknown[]> {
  await withinDeadline(fixture.reset(url), "the fixture's reset");
  const manifest = await getManifest(url);
  const connector = CONNECTOR_MANIFEST.parse(manifest).connectors.find(
    ({ key }) => key === fixture.connector,
  );
  const [flow, testAnswer] = await startFlow(url, fixture);
  const answers = [manifest, testAnswer, ...(await listPages(flow))];
  const capabilities = connector?.capabilities ?? [];
  const actions = capabilities.includes("suspend")
    ? (["suspend"] as const)
    : (["invite", "remove"] as const).filter((action) => capabilities.includes(action));
  for (const action of actions) {
    const answer = await send(flow, "actions/run", actionFields(fixture, action));
    expect(ACTION_RUN_ANSWER.safeParse(answer).error, `the ${action} answer`).toBeUndefined();
    answers.push(answer);
  }
  return answers.map(withoutRenewedSecrets);
}

/** Two containers may renew a session differently; the answers about the app must still agree. */
function withoutRenewedSecrets(answer: unknown): unknown {
  if (typeof answer !== "object" || answer === null || !("connection" in answer)) return answer;
  const { connection, ...rest } = answer as { connection: Record<string, unknown> };
  const kept = Object.fromEntries(Object.entries(connection).filter(([key]) => key !== "secrets"));
  return Object.keys(kept).length === 0 ? rest : { ...rest, connection: kept };
}
