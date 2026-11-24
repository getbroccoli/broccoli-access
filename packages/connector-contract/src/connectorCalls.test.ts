import { expect, it } from "vitest";

import {
  APP_CALL,
  APP_SESSION,
  CONNECTION_SIGN_IN_REQUEST,
  CONNECTION_SIGN_IN_ANSWER,
  INTEGRATION_USER_SETUP_REQUEST,
  INTEGRATION_USER_SETUP_ANSWER,
  CONNECTION_TEST_ANSWER,
  ACCOUNTS_LIST_ANSWER,
  ACTION_RUN_REQUEST,
  ACTION_RUN_ANSWER,
  CONNECTOR_ERROR_ANSWER,
  ACCOUNTS_LIST_REQUEST,
  RUNTIME,
} from "./connectorCalls.js";

it("parses the documented app session", () => {
  expect(APP_SESSION.parse(appSession)).toEqual(appSession);
});

it("rejects an owner browser runtime without a WebSocket address", () => {
  const runtime = { kind: "owner_browser", url: "http://broccoli-access:3000/x" };
  const websocket = { ...runtime, url: "ws://broccoli-access:3000/internal/owner-browser/abc" };

  expect(RUNTIME.safeParse(runtime).success).toBe(false);
  expect(RUNTIME.safeParse(websocket).success).toBe(true);
});

it("parses the documented connection test answer", () => {
  expect(CONNECTION_TEST_ANSWER.parse(connectionTest)).toEqual(connectionTest);
});

it("parses the documented list answer", () => {
  expect(ACCOUNTS_LIST_ANSWER.parse(list)).toEqual(list);
});

it.for(["suspend", "reactivate", "remove"])(
  "parses a %s request for an existing member",
  (action) => {
    const request = { ...actionRequest, action };
    expect(ACTION_RUN_REQUEST.parse(request)).toEqual(request);
  },
);

it("parses the documented action answer", () => {
  expect(ACTION_RUN_ANSWER.parse(actionAnswer)).toEqual(actionAnswer);
});

it.for(["blocked_by_check", "not_invited"])("parses a %s error answer", (code) => {
  const answer = { error: { ...errorAnswer.error, code } };
  expect(CONNECTOR_ERROR_ANSWER.parse(answer)).toEqual(answer);
});

it.for([
  { name: "connection test", schema: CONNECTION_TEST_ANSWER },
  { name: "accounts list", schema: ACCOUNTS_LIST_ANSWER },
  { name: "action run", schema: ACTION_RUN_ANSWER },
  { name: "connector error", schema: CONNECTOR_ERROR_ANSWER },
] as const)("keeps the app calls in the $name answer", ({ name, schema }) => {
  const withCalls = { ...documentedAnswers[name], appCalls: [appCall] };

  expect(schema.parse(withCalls)).toEqual(withCalls);
});

it.for([
  { reason: "a string status", fields: { status: "200" } },
  { reason: "an empty call", fields: { call: "" } },
  { reason: "a query in the path", fields: { call: "POST /api/auth.test?token=x" } },
  { reason: "a host in the path", fields: { call: "POST https://slack.com/api/auth.test" } },
  { reason: "a scheme-relative path", fields: { call: "POST //slack.com/api/auth.test" } },
  { reason: "a backslash in the path", fields: { call: "POST /\\slack.com/api" } },
  { reason: "a string for sent arguments", fields: { sent: "token=x" } },
  { reason: "an array for sent arguments", fields: { sent: ["token=x"] } },
  { reason: "a status of 900", fields: { status: 900 } },
  { reason: "a reply without an HTTP status", fields: { status: null, reply: { ok: true } } },
])("rejects an app call with $reason", ({ fields }) => {
  expect(APP_CALL.safeParse({ ...appCall, ...fields }).success).toBe(false);
});

it("accepts an app call with no arguments when the app never answered", () => {
  const unanswered = { call: "GET /status", sent: null, status: null, reply: null };

  expect(APP_CALL.parse(unanswered)).toEqual(unanswered);
});

it("accepts an HTTP status with a null reply when the body went unread", () => {
  const unread = { ...appCall, status: 200, reply: null };

  expect(APP_CALL.parse(unread)).toEqual(unread);
});

it("parses a first page request with the documented connection", () => {
  const request = { ...connection, runtime: { kind: "server" }, cursor: null };

  expect(ACCOUNTS_LIST_REQUEST.parse(request)).toEqual(request);
});

it("rejects an unknown error code", () => {
  expect(CONNECTOR_ERROR_ANSWER.safeParse({ error: { code: "timeout" } }).success).toBe(false);
});

it("rejects a screenshot longer than one megabyte of base64", () => {
  const error = { ...errorAnswer.error, screenshot: "A".repeat(1_398_105) };

  expect(CONNECTOR_ERROR_ANSWER.safeParse({ error }).success).toBe(false);
});

it("rejects a listed account with an uppercase email", () => {
  const invalid = structuredClone(list);
  invalid.accounts[0]!.values.email = "Jane@acme.example";

  expect(ACCOUNTS_LIST_ANSWER.safeParse(invalid).success).toBe(false);
});

it("rejects a listed account with deactivated status", () => {
  const invalid = structuredClone(list);
  invalid.accounts[0]!.values.status = "deactivated";

  expect(ACCOUNTS_LIST_ANSWER.safeParse(invalid).success).toBe(false);
});

it("requires changed in an action answer", () => {
  expect(ACTION_RUN_ANSWER.safeParse({ account: actionAnswer.account }).success).toBe(false);
});

it("parses an invite request with just the email as its account", () => {
  expect(ACTION_RUN_REQUEST.parse(inviteRequest)).toEqual(inviteRequest);
});

it.for(["suspend", "reactivate", "remove"])("requires a source key to %s a member", (action) => {
  const request = { ...actionRequest, action, account: { email: invitation.email } };

  expect(ACTION_RUN_REQUEST.safeParse(request).success).toBe(false);
});

it("rejects an invite request without an email", () => {
  const request = { ...actionRequest, action: "invite", account: {} };

  expect(ACTION_RUN_REQUEST.safeParse(request).success).toBe(false);
});

it.for([
  { dates: "known", invitedAt: "2026-03-01T10:00:00+01:00", expiresAt: "2026-03-31T09:00:00Z" },
  { dates: "null", invitedAt: null, expiresAt: null },
])("parses an invite answer with $dates dates", ({ invitedAt, expiresAt }) => {
  const answer = { changed: true, invitation: { email: invitation.email, invitedAt, expiresAt } };

  expect(ACTION_RUN_ANSWER.parse(answer)).toEqual(answer);
});

it("rejects an action answer with both a member and an invitation", () => {
  expect(ACTION_RUN_ANSWER.safeParse({ ...actionAnswer, invitation }).success).toBe(false);
});

it("rejects an action answer with neither a member nor an invitation", () => {
  expect(ACTION_RUN_ANSWER.safeParse({ changed: false }).success).toBe(false);
});

it("rejects an invitation whose invitedAt lacks the time", () => {
  const answer = { changed: true, invitation: { ...invitation, invitedAt: "2026-03-01" } };

  expect(ACTION_RUN_ANSWER.safeParse(answer).success).toBe(false);
});

it("parses a list answer with pending invitations", () => {
  const answer = { ...list, invitations: [invitation] };

  expect(ACCOUNTS_LIST_ANSWER.parse(answer)).toEqual(answer);
});

it("keeps an invite role even if the connector does not list it", () => {
  const request = { ...inviteRequest, account: { ...inviteRequest.account, role: "unlisted" } };
  expect(ACTION_RUN_REQUEST.parse(request)).toEqual(request);
});

it("rejects an empty invite role", () => {
  const request = { ...inviteRequest, account: { ...inviteRequest.account, role: "" } };
  expect(ACTION_RUN_REQUEST.safeParse(request).success).toBe(false);
});

it.for([true, false])("parses a remove answer with changed %s", (changed) => {
  const answer = { changed, removed: true };
  expect(ACTION_RUN_ANSWER.parse(answer)).toEqual(answer);
});

it("keeps the connection update and app calls in a remove answer", () => {
  const answer = { changed: true, removed: true, connection: list.connection, appCalls: [appCall] };
  expect(ACTION_RUN_ANSWER.parse(answer)).toEqual(answer);
});

it.for([true, false])("rejects an account or invitation answer with removed %s", (removed) => {
  expect(ACTION_RUN_ANSWER.safeParse({ ...actionAnswer, removed }).success).toBe(false);
  expect(ACTION_RUN_ANSWER.safeParse({ changed: true, invitation, removed }).success).toBe(false);
});

it("rejects removed false as a remove answer", () => {
  expect(ACTION_RUN_ANSWER.safeParse({ changed: false, removed: false }).success).toBe(false);
});

it.for([null, "demo-secret"])("parses a setup request with two-step secret %s", (totpSecret) => {
  const request = {
    integrationUser: { ...integrationUser, totpSecret },
  };
  expect(INTEGRATION_USER_SETUP_REQUEST.parse(request)).toEqual(request);
});

it.for([
  { reason: "an uppercase email", fields: { email: "Broccoli@acme.example" } },
  { reason: "an empty password", fields: { password: "" } },
  { reason: "an empty two-step secret", fields: { totpSecret: "" } },
  { reason: "a missing two-step secret", fields: { totpSecret: undefined } },
])("rejects $reason in integration user credentials", ({ fields }) => {
  const request = { integrationUser: { ...integrationUser, ...fields } };
  expect(INTEGRATION_USER_SETUP_REQUEST.safeParse(request).success).toBe(false);
  expect(CONNECTION_SIGN_IN_REQUEST.safeParse({ ...signInRequest, ...request }).success).toBe(
    false,
  );
});

it("requires a non-empty secret in a setup answer", () => {
  const answer = { totpSecret: "demo-secret" };
  expect(INTEGRATION_USER_SETUP_ANSWER.parse(answer)).toEqual(answer);
  expect(INTEGRATION_USER_SETUP_ANSWER.safeParse({ totpSecret: "" }).success).toBe(false);
});

it("accepts sign-in with a new or stored connection", () => {
  for (const stored of [null, connection.connection]) {
    const request = { ...signInRequest, connection: stored };
    expect(CONNECTION_SIGN_IN_REQUEST.parse(request)).toEqual(request);
  }
});

it("requires the connection key in a sign-in request", () => {
  const request = { connector: "slack", integrationUser };
  expect(CONNECTION_SIGN_IN_REQUEST.safeParse(request).success).toBe(false);
});

it("rejects an unnamed connector in a sign-in request", () => {
  const request = { ...signInRequest, connector: "" };
  expect(CONNECTION_SIGN_IN_REQUEST.safeParse(request).success).toBe(false);
});

it("parses the full connection and workspace details from sign-in", () => {
  const answer = { ...connectionTest, connection: connection.connection };
  expect(CONNECTION_SIGN_IN_ANSWER.parse(answer)).toEqual(answer);
});

it.for([
  { reason: "no connection", fields: {} },
  { reason: "no settings", fields: { connection: { secrets: {} } } },
  { reason: "no secrets", fields: { connection: { settings: {} } } },
])("rejects a sign-in answer with $reason", ({ fields }) => {
  const answer = { details: connectionTest.details, ...fields };
  expect(CONNECTION_SIGN_IN_ANSWER.safeParse(answer).success).toBe(false);
});

it("requires workspace details in a sign-in answer", () => {
  const answer = { connection: connection.connection };
  expect(CONNECTION_SIGN_IN_ANSWER.safeParse(answer).success).toBe(false);
});

const integrationUser = {
  email: "broccoli@acme.example",
  password: "demo-password",
  totpSecret: "demo-secret",
};

const signInRequest = {
  connector: "slack",
  integrationUser,
  connection: null,
};

const invitation = { email: "ivan@acme.example", invitedAt: null, expiresAt: null };

const connection = {
  connector: "linear",
  connection: {
    settings: { organizationId: "4a1c…", urlKey: "acme" },
    secrets: { apiKey: "lin_api_…" },
  },
};

const appSession = {
  cookies: [
    {
      name: "d",
      value: "…",
      domain: ".slack.com",
      path: "/",
      expires: 1798000000,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ],
  storage: { localConfig_v2: "…" },
};

const connectionTest = {
  details: { organizationName: "Acme", domain: null },
  connection: { settings: { organizationId: "4a1c…", urlKey: "acme" } },
};

const list = {
  accounts: [
    {
      sourceKey: "U04ABCDEF",
      raw: { id: "U04ABCDEF", deleted: false },
      values: {
        email: "jane@acme.example",
        status: "active",
        displayName: "Jane Doe",
        isConnectionUser: false,
      },
    },
  ],
  nextCursor: null,
  connection: { secrets: { appSession: { cookies: [] } } },
};

const actionRequest = {
  connector: "slack",
  connection: { settings: {}, secrets: {} },
  action: "suspend",
  account: { sourceKey: "U04ABCDEF", email: "jane@acme.example" },
  runtime: { kind: "server" },
};

const inviteRequest = { ...actionRequest, action: "invite", account: { email: invitation.email } };

const actionAnswer = {
  changed: true,
  account: {
    sourceKey: "U04ABCDEF",
    values: { ...list.accounts[0]!.values, status: "suspended" },
  },
};

const errorAnswer = { error: { code: "blocked_by_check", screenshot: "<base64 PNG>" } };

const appCall = {
  call: "POST /api/auth.test",
  sent: { token: "[redacted]" },
  status: 200,
  reply: { ok: true },
};

const documentedAnswers = {
  "connection test": connectionTest,
  "accounts list": list,
  "action run": actionAnswer,
  "connector error": errorAnswer,
};
