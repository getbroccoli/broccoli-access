import {
  ACCOUNTS_LIST_ANSWER,
  type AccountsListAnswer,
  type AccountsListRequest,
  ACTION_RUN_ANSWER,
  type ActionRunAnswer,
  type ActionRunRequest,
  CONNECTION_TEST_ANSWER,
  type ConnectionTestAnswer,
  type ConnectionTestRequest,
  CONNECTOR_ERROR_CODES,
  CONNECTOR_MANIFEST,
  type ConnectorDescription,
  type ConnectorErrorCode,
} from "@broccoli-access/connector-contract";
import { z } from "zod";

import { fetchBytes, fetchJson, urlUnder } from "../../utils";

/** The connectors container, spoken to over the connector contract. */
export interface ConnectorsContainerClient {
  /** The connectors it offers; rejects when it does not answer with a valid list. */
  readConnectors(): Promise<ConnectorDescription[]>;
  testConnection(request: ConnectionTestRequest): Promise<ContainerAnswer<ConnectionTestAnswer>>;
  listAccounts(request: AccountsListRequest): Promise<ContainerAnswer<AccountsListAnswer>>;
  runAction(request: ActionRunRequest): Promise<ContainerAnswer<ActionRunAnswer>>;
}

/**
 * A call's answer, or the connector error it stands for: the container failing is
 * `app_unavailable`, an answer nobody understands `unexpected_response`.
 */
export type ContainerAnswer<T> = { answer: T } | { error: CallErrorCode };

/** The errors these calls give; `not_invited` comes only from signing in as the integration user. */
type CallErrorCode = Exclude<ConnectorErrorCode, "not_invited">;

export function createConnectorsContainerClient(url: string): ConnectorsContainerClient {
  return {
    async readConnectors() {
      const manifest = await fetchJson(urlUnder(url, "v1/connectors"), CONNECTOR_MANIFEST, {
        timeoutMs: LIST_TIMEOUT_MS,
        maxBytes: MAX_ANSWER_BYTES,
      });
      if (manifest === null) {
        throw new Error("The connectors container answered 404 for its connectors");
      }
      return manifest.connectors;
    },
    testConnection: (request) =>
      call(urlUnder(url, "v1/connections/test"), request, CONNECTION_TEST_ANSWER),
    listAccounts: (request) =>
      call(urlUnder(url, "v1/accounts/list"), request, ACCOUNTS_LIST_ANSWER),
    runAction: (request) => call(urlUnder(url, "v1/actions/run"), request, ACTION_RUN_ANSWER),
  };
}

/** The contract's wait for any call: no answer by then is the container failing. */
const CALL_TIMEOUT_MS = 120_000;

/** The list is fixed when the container starts, so a slower answer means it is down. */
const LIST_TIMEOUT_MS = 10_000;

/** Above a page of every member a robot may answer with, and an error's 1 MB screenshot. */
const MAX_ANSWER_BYTES = 16 * 1024 * 1024;

/** Read leniently: a code a newer container adds is still an error, read as `unexpected_response`. */
const ERROR_ANSWER = z.object({ error: z.object({ code: z.string() }) });

async function call<T>(
  url: URL,
  request: unknown,
  schema: z.ZodType<T>,
): Promise<ContainerAnswer<T>> {
  const bytes = await postJson(url, request);
  if (bytes === null) {
    return { error: "app_unavailable" };
  }
  const body = parsedJson(bytes);
  const error = ERROR_ANSWER.safeParse(body);
  if (error.success) {
    return { error: knownErrorCode(error.data.error.code) };
  }
  const answer = schema.safeParse(body);
  return answer.success ? { answer: answer.data } : { error: "unexpected_response" };
}

/** The answer's body; null when the container did not answer 200 in time. */
async function postJson(url: URL, request: unknown): Promise<Buffer | null> {
  try {
    return await fetchBytes(url, {
      timeoutMs: CALL_TIMEOUT_MS,
      maxBytes: MAX_ANSWER_BYTES,
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        // A redirect would send the connection's secrets to another address.
        redirect: "error",
      },
    });
  } catch {
    // Each failure here is the container's own: no answer in time, another status, a redirect or
    // too large a body.
    return null;
  }
}

/** The body as JSON; undefined for one that is not, which no schema accepts. */
function parsedJson(bytes: Buffer): unknown {
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function knownErrorCode(code: string): CallErrorCode {
  return code !== "not_invited" && (CONNECTOR_ERROR_CODES as readonly string[]).includes(code)
    ? (code as CallErrorCode)
    : "unexpected_response";
}
