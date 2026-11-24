import { expect } from "vitest";
import { z } from "zod";

import {
  ACCOUNTS_LIST_ANSWER,
  ACTION_RUN_ANSWER,
  CONNECTION_TEST_ANSWER,
  CONNECTION_UPDATE,
  CONNECTOR_ERROR_ANSWER,
  CONNECTOR_ERROR_CODES,
  type AccountAction,
  type Connection,
  type ConnectorCall,
  type Invitation,
  type ListedAccount,
} from "../connectorCalls.js";
import {
  CONNECTOR_MANIFEST,
  type Capability,
  type ConnectorDescription,
  type RuntimeKind,
} from "../connectorManifest.js";
import type { ConnectorFixture } from "./describeConnectorConformance.js";

/** One connection used for a series of calls, as the core keeps it between them. */
export interface Flow {
  url: string;
  fixture: ConnectorFixture;
  connection: Connection;
}

/** A connection that passed its test, with the settings the test found, and the test's answer. */
export async function startFlow(url: string, fixture: ConnectorFixture): Promise<[Flow, unknown]> {
  const connection = await withinDeadline(fixture.connection(url), "the fixture's connection");
  const flow = { url, fixture, connection };
  const answer = await send(flow, "connections/test", {});
  expect(CONNECTION_TEST_ANSWER.safeParse(answer).error, "the test's answer").toBeUndefined();
  return [flow, answer];
}

export async function listAll(flow: Flow): Promise<ListedAccount[]> {
  const pages = await listPages(flow);
  return pages.flatMap((page) => ACCOUNTS_LIST_ANSWER.parse(page).accounts);
}

export async function listAllInvitations(flow: Flow): Promise<Invitation[]> {
  const pages = await listPages(flow);
  return pages.flatMap((page) => ACCOUNTS_LIST_ANSWER.parse(page).invitations ?? []);
}

export async function listPages(flow: Flow): Promise<unknown[]> {
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
export async function send(flow: Flow, path: ConnectorCall, fields: object): Promise<unknown> {
  const answer = await call(flow.url, path, { ...requestOf(flow, "connections/test"), ...fields });
  const update = isError(answer) ? undefined : UPDATING_ANSWER.safeParse(answer).data?.connection;
  // Each object an update carries replaces the stored one (contract "The connection").
  if (update !== undefined) flow.connection = { ...flow.connection, ...update };
  return answer;
}

/** A request for `path` that the connector would answer. */
export function requestOf(flow: Flow, path: ConnectorCall): object {
  const request = {
    connector: flow.fixture.connector,
    connection: flow.connection,
    runtime: SERVER,
  };
  if (path === "accounts/list") return { ...request, cursor: null };
  if (path === "actions/run") return { ...request, ...actionFields(flow.fixture, "suspend") };
  return request;
}

export function actionFields(fixture: ConnectorFixture, action: AccountAction) {
  return { action, account: fixture.member };
}

/** Fails a fixture step that never settles, as a call past its deadline fails. */
export async function withinDeadline<T>(step: Promise<T>, name: string): Promise<T> {
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

export async function runtimesOf(url: string, connector: string): Promise<RuntimeKind[]> {
  return (await descriptionOf(url, connector))?.runtimes ?? [];
}

export async function capabilitiesOf(url: string, connector: string): Promise<Capability[]> {
  return (await descriptionOf(url, connector))?.capabilities ?? [];
}

export async function getManifest(url: string): Promise<unknown> {
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
export function post(url: string, path: string, body: object): Promise<Response> {
  return fetch(`${url}/v1/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
}

export const SERVER = { kind: "server" } as const;

/** A connector answers within 90 seconds (contract "Answers"). */
const CALL_TIMEOUT_MS = 90_000;

/** A fixture talks to a fake app on the same machine, so it gets a connector call's time too. */
const FIXTURE_TIMEOUT_MS = CALL_TIMEOUT_MS;

/** A paging loop that never ends is a failure, not a hang. */
const MAX_PAGES = 1_000;

const ANY_ANSWER = z.union([
  CONNECTION_TEST_ANSWER,
  ACCOUNTS_LIST_ANSWER,
  ACTION_RUN_ANSWER,
  CONNECTOR_ERROR_ANSWER,
]);

const UPDATING_ANSWER = z.object({ connection: CONNECTION_UPDATE.optional() });

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

async function descriptionOf(
  url: string,
  connector: string,
): Promise<ConnectorDescription | undefined> {
  const manifest = CONNECTOR_MANIFEST.parse(await getManifest(url));
  return manifest.connectors.find(({ key }) => key === connector);
}
