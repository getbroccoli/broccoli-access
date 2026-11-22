import { expect, it } from "vitest";

import {
  APP_SESSION,
  CONNECTION_TEST_ANSWER,
  ACCOUNTS_LIST_ANSWER,
  ACTION_RUN_REQUEST,
  ACTION_RUN_ANSWER,
  CONNECTOR_ERROR_ANSWER,
  ACCOUNTS_LIST_REQUEST,
} from "./connectorCalls.js";

it("parses the documented app session", () => {
  expect(APP_SESSION.parse(appSession)).toEqual(appSession);
});

it("parses the documented connection test answer", () => {
  expect(CONNECTION_TEST_ANSWER.parse(connectionTest)).toEqual(connectionTest);
});

it("parses the documented list answer", () => {
  expect(ACCOUNTS_LIST_ANSWER.parse(list)).toEqual(list);
});

it("parses the documented action request", () => {
  expect(ACTION_RUN_REQUEST.parse(actionRequest)).toEqual(actionRequest);
});

it("parses the documented action answer", () => {
  expect(ACTION_RUN_ANSWER.parse(actionAnswer)).toEqual(actionAnswer);
});

it("parses the documented error answer", () => {
  expect(CONNECTOR_ERROR_ANSWER.parse(errorAnswer)).toEqual(errorAnswer);
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

const actionAnswer = {
  changed: true,
  account: {
    sourceKey: "U04ABCDEF",
    values: {
      email: "jane@acme.example",
      status: "suspended",
      displayName: "Jane Doe",
      isConnectionUser: false,
    },
  },
};

const errorAnswer = { error: { code: "blocked_by_check", screenshot: "<base64 PNG>" } };
