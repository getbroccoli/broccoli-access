import {
  ACCOUNTS_LIST_ANSWER,
  type AccountsListAnswer,
  type AccountsListRequest,
  ACTION_RUN_ANSWER,
  type ActionRunAnswer,
  type ActionRunRequest,
  CONNECTION_SIGN_IN_ANSWER,
  type ConnectionSignInAnswer,
  type ConnectionSignInRequest,
  CONNECTION_TEST_ANSWER,
  type ConnectionTestAnswer,
  type ConnectionTestRequest,
  CONNECTOR_DESCRIPTION,
  CONNECTOR_ERROR_CODES,
  type ConnectorDescription,
  type ConnectorErrorCode,
  INTEGRATION_USER_SETUP_ANSWER,
  type IntegrationUserSetupAnswer,
  type IntegrationUserSetupRequest,
} from "@broccoli-access/connector-contract";
import { z } from "zod";

import {
  AnswerTooLargeError,
  fetchBytes,
  fetchJson,
  UnsuccessfulAnswerError,
  urlUnder,
} from "../../utils";

/** The connectors container, spoken to over the connector contract. */
export interface ConnectorsContainerClient {
  /** Parses each connector independently so an invalid entry does not hide the others. */
  readConnectors(): Promise<ConnectorListing>;
  testConnection(request: ConnectionTestRequest): Promise<ContainerAnswer<ConnectionTestAnswer>>;
  listAccounts(request: AccountsListRequest): Promise<ContainerAnswer<AccountsListAnswer>>;
  runAction(request: ActionRunRequest): Promise<ContainerAnswer<ActionRunAnswer>>;
  /** Sets up the integration user's two-step sign-in in the container's browser, and answers its secret. */
  setUpIntegrationUser(
    request: IntegrationUserSetupRequest,
  ): Promise<ContainerAnswer<IntegrationUserSetupAnswer>>;
  /** Signs in to the connector's app as the integration user in the container's browser, and answers its connection. */
  signInToApp(
    request: ConnectionSignInRequest,
  ): Promise<ContainerAnswer<ConnectionSignInAnswer, ConnectorErrorCode>>;
}

interface ConnectorListing {
  descriptions: ConnectorDescription[];
  rejected: (string | null)[];
}

/**
 * A call's answer, or the connector error it stands for: the container failing is
 * `app_unavailable`, an answer nobody understands `unexpected_response`.
 */
export type ContainerAnswer<T, Code = CallErrorCode> =
  | { answer: T }
  | { error: Code; answerLost?: never }
  | { error: "app_unavailable"; answerLost: true };

/** The errors every call gives; `not_invited` comes only from signing in to an app as the integration user. */
type CallErrorCode = Exclude<ConnectorErrorCode, "not_invited">;

export function createConnectorsContainerClient(url: string): ConnectorsContainerClient {
  return {
    async readConnectors() {
      const manifest = await fetchJson(urlUnder(url, "v1/connectors"), CONNECTOR_LIST, {
        timeoutMs: LIST_TIMEOUT_MS,
        maxBytes: MAX_ANSWER_BYTES,
      });
      if (manifest === null) {
        throw new Error("The connectors container answered 404 for its connectors");
      }
      return connectorListing(manifest.connectors);
    },
    testConnection: (request) =>
      callWithoutSignIn(urlUnder(url, "v1/connections/test"), request, CONNECTION_TEST_ANSWER),
    listAccounts: (request) =>
      callWithoutSignIn(urlUnder(url, "v1/accounts/list"), request, ACCOUNTS_LIST_ANSWER),
    runAction: (request) =>
      callWithoutSignIn(urlUnder(url, "v1/actions/run"), request, ACTION_RUN_ANSWER),
    setUpIntegrationUser: (request) =>
      callWithoutSignIn(
        urlUnder(url, "v1/integration-user/setup"),
        request,
        INTEGRATION_USER_SETUP_ANSWER,
        SIGN_IN_TIMEOUT_MS,
      ),
    signInToApp: (request) =>
      call(
        urlUnder(url, "v1/connections/sign-in"),
        request,
        CONNECTION_SIGN_IN_ANSWER,
        SIGN_IN_TIMEOUT_MS,
      ),
  };
}

const CONNECTOR_LIST = z.object({ connectors: z.array(z.unknown()) });
const CONNECTOR_KEY = z.object({ key: z.string().regex(/^[a-z0-9_-]+$/i) });

function connectorListing(entries: readonly unknown[]): ConnectorListing {
  const descriptions: ConnectorDescription[] = [];
  const rejected: (string | null)[] = [];
  for (const entry of entries) {
    const result = CONNECTOR_DESCRIPTION.safeParse(entry);
    if (result.success) {
      descriptions.push(result.data);
    } else {
      rejected.push(CONNECTOR_KEY.safeParse(entry).data?.key ?? null);
    }
  }
  return { descriptions, rejected };
}

/** The contract's wait for any call: no answer by then is the container failing. */
const CALL_TIMEOUT_MS = 120_000;

/** The contract's wait for a call that signs in through several pages, which may take 180 seconds. */
const SIGN_IN_TIMEOUT_MS = 240_000;

/** The Discovered tab waits for this static manifest, so keep the deadline short. */
const LIST_TIMEOUT_MS = 2_000;

/** Above a page of every member a robot may answer with, and an error's 1 MB screenshot. */
const MAX_ANSWER_BYTES = 16 * 1024 * 1024;

/** Read leniently: a code a newer container adds is still an error, read as `unexpected_response`. */
const ERROR_ANSWER = z.object({ error: z.object({ code: z.string() }) });

/** A call that signs in to no app, so `not_invited` from it is an answer nobody understands. */
async function callWithoutSignIn<T>(
  ...request: Parameters<typeof call<T>>
): Promise<ContainerAnswer<T>> {
  const answer = await call(...request);
  return "error" in answer && answer.error === "not_invited"
    ? { error: "unexpected_response" }
    : (answer as ContainerAnswer<T>);
}

async function call<T>(
  url: URL,
  request: unknown,
  schema: z.ZodType<T>,
  timeoutMs = CALL_TIMEOUT_MS,
): Promise<ContainerAnswer<T, ConnectorErrorCode>> {
  const bytes = await postJson(url, request, timeoutMs);
  if (bytes === undefined) return { error: "app_unavailable", answerLost: true };
  if (bytes === null) return { error: "app_unavailable" };
  const body = parsedJson(bytes);
  const error = ERROR_ANSWER.safeParse(body);
  if (error.success) {
    return { error: knownErrorCode(error.data.error.code) };
  }
  const answer = schema.safeParse(body);
  return answer.success ? { answer: answer.data } : { error: "unexpected_response" };
}

/** The answer's body, null for a refused response, or undefined when no reply arrived. */
async function postJson(
  url: URL,
  request: unknown,
  timeoutMs: number,
): Promise<Buffer | null | undefined> {
  try {
    return await fetchBytes(url, {
      timeoutMs,
      maxBytes: MAX_ANSWER_BYTES,
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        // A redirect would send the connection's secrets to another address.
        redirect: "error",
      },
    });
  } catch (error) {
    if (error instanceof UnsuccessfulAnswerError || error instanceof AnswerTooLargeError)
      return null;
    return undefined;
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

function knownErrorCode(code: string): ConnectorErrorCode {
  return (CONNECTOR_ERROR_CODES as readonly string[]).includes(code)
    ? (code as ConnectorErrorCode)
    : "unexpected_response";
}
