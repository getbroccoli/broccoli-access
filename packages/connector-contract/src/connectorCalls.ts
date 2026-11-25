import { z } from "zod";

/** The calls that carry a connection and a runtime, by their path after `/v1/`. */
export const CONNECTOR_CALLS = ["connections/test", "accounts/list", "actions/run"] as const;

/** The calls that carry the integration user and no runtime: the container's own browser signs in. */
export const INTEGRATION_USER_CALLS = ["integration-user/setup", "connections/sign-in"] as const;

/** Why a connector failed (contract "Errors"); it never passes on the app's raw answer. */
export const CONNECTOR_ERROR_CODES = [
  "authentication_failed",
  "permission_missing",
  "rate_limited",
  "app_unavailable",
  "unexpected_response",
  "blocked_by_check",
  "account_not_found",
  "wrong_workspace",
  "not_allowed",
  "owner_browser_lost",
  "not_invited",
] as const;

/** Whether the member may use their account in the app; pending invitations are not members. */
export const ACCOUNT_STATUSES = ["active", "suspended"] as const;

/** The changes `actions/run` makes: to one member, or an invitation of one email. */
export const ACCOUNT_ACTIONS = ["suspend", "reactivate", "invite", "remove"] as const;

/** The actions on an existing member, which name it by its `sourceKey` and email. */
const MEMBER_ACTIONS = [
  "suspend",
  "reactivate",
  "remove",
] as const satisfies readonly AccountAction[];

/**
 * The longest screenshot an error carries: 1 MB of PNG as base64, which takes four characters
 * for every three bytes.
 */
const MAX_SCREENSHOT_LENGTH = Math.ceil((1024 * 1024) / 3) * 4;

/**
 * The header that asks a container for the calls it made to the app (contract "Debug: the app's
 * calls"); only the connectors' own harness sends it, never the core.
 */
export const APP_CALLS_HEADER = { name: "x-debug", value: "app-calls" } as const;

/** One call the connector made to the app, with cookies, tokens and keys redacted. */
export const APP_CALL = z
  .object({
    /** The HTTP method and the app's path, without host or query, such as `POST /api/auth.test`. */
    call: z.string().regex(/^[A-Z]+ \/(?!\/)[^\s?#\\]*$/),
    /** The arguments sent; null when none. */
    sent: z.record(z.string(), z.unknown()).nullable(),
    /** Null when the app never answered. */
    status: z.number().int().min(100).max(599).nullable(),
    /** The app's reply, parsed JSON, else text; null when it never answered or went unread. */
    reply: z.unknown(),
  })
  .refine(({ status, reply }) => status !== null || reply === null, {
    message: "An app call the app never answered has no reply",
  });

/** Present only on an answer to a request with `APP_CALLS_HEADER`, in call order. */
const APP_CALLS = z.array(APP_CALL).optional();

/** Opaque JSON that only the connector reads. */
const OPAQUE_OBJECT = z.record(z.string(), z.unknown());

/** Settings and secrets, sent with every call except the manifest. */
export const CONNECTION = z.object({ settings: OPAQUE_OBJECT, secrets: OPAQUE_OBJECT });

/** New settings or secrets in a successful answer; each object it carries replaces the stored one. */
export const CONNECTION_UPDATE = z.object({
  settings: OPAQUE_OBJECT.optional(),
  secrets: OPAQUE_OBJECT.optional(),
});

/** The secret of an `app_session` field: cookies for the field's domains and its storage keys. */
export const APP_SESSION = z.object({
  cookies: z.array(
    z.object({
      name: z.string().min(1),
      value: z.string(),
      domain: z.string().min(1),
      path: z.string().min(1),
      /** Seconds since the epoch; a session cookie has none. */
      expires: z.number().optional(),
      httpOnly: z.boolean(),
      secure: z.boolean(),
      sameSite: z.enum(["Strict", "Lax", "None"]),
    }),
  ),
  storage: z.record(z.string(), z.string()),
});

/** Where a call runs; an owner's browser address works for one call only. */
export const RUNTIME = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("server") }),
  z.object({ kind: z.literal("owner_browser"), url: z.url({ protocol: /^wss?$/ }) }),
]);

const CALL = z.object({ connector: z.string().min(1), connection: CONNECTION, runtime: RUNTIME });

/** Emails are lowercased on the wire. */
const EMAIL = z.email().refine((email) => email === email.toLowerCase(), "Lowercase the email");

const ACCOUNT_VALUES = z.object({
  email: EMAIL,
  status: z.enum(ACCOUNT_STATUSES),
  displayName: z.string(),
  /** The member whose key or session the connection uses; the core never offers Disable on it. */
  isConnectionUser: z.boolean(),
});

export const CONNECTION_TEST_REQUEST = CALL;

export const CONNECTION_TEST_ANSWER = z.object({
  details: z.object({ organizationName: z.string(), domain: z.string().nullable() }),
  connection: CONNECTION_UPDATE.optional(),
  appCalls: APP_CALLS,
});

/** A pending invitation; the dates are null when the app does not give them. */
const INVITATION = z.object({
  email: EMAIL,
  invitedAt: z.iso.datetime({ offset: true }).nullable(),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
});

export const ACCOUNTS_LIST_REQUEST = CALL.extend({ cursor: z.string().nullable() });

export const ACCOUNTS_LIST_ANSWER = z.object({
  accounts: z.array(
    z.object({
      /** The app's own id for the member, unique within the workspace. */
      sourceKey: z.string().min(1),
      raw: OPAQUE_OBJECT,
      values: ACCOUNT_VALUES,
    }),
  ),
  /** Only from a connector that lists `list_invitations`, on any page of the scan. */
  invitations: z.array(INVITATION).optional(),
  nextCursor: z.string().nullable(),
  connection: CONNECTION_UPDATE.optional(),
  appCalls: APP_CALLS,
});

/**
 * An invite names its recipient by email only, whether or not a member has that email, with an
 * optional role: one of the connector's `roles` keys, which only the container can check.
 */
export const ACTION_RUN_REQUEST = z.discriminatedUnion("action", [
  CALL.extend({
    action: z.enum(MEMBER_ACTIONS),
    account: z.object({ sourceKey: z.string().min(1), email: EMAIL }),
  }),
  CALL.extend({
    action: z.literal("invite"),
    account: z.object({ email: EMAIL, role: z.string().min(1).optional() }),
  }),
]);

const ACTION_ANSWER = z.object({
  changed: z.boolean(),
  connection: CONNECTION_UPDATE.optional(),
  appCalls: APP_CALLS,
});

const NOTHING = z.undefined().optional();

/**
 * Whether anything changed, and what the connector read again after the call: the member, an
 * invite's pending invitation, or for a remove, that the member is gone.
 * Never two of them.
 */
export const ACTION_RUN_ANSWER = z.union([
  ACTION_ANSWER.extend({
    account: z.object({ sourceKey: z.string().min(1), values: ACCOUNT_VALUES }),
    invitation: NOTHING,
    removed: NOTHING,
  }),
  ACTION_ANSWER.extend({ invitation: INVITATION, account: NOTHING, removed: NOTHING }),
  ACTION_ANSWER.extend({ removed: z.literal(true), account: NOTHING, invitation: NOTHING }),
]);

/** The integration user as the directory knows it; `totpSecret` is null until its setup. */
const INTEGRATION_USER = z.object({
  email: EMAIL,
  password: z.string().min(1),
  totpSecret: z.string().min(1).nullable(),
});

export const INTEGRATION_USER_SETUP_REQUEST = z.object({ integrationUser: INTEGRATION_USER });

/** The two-step secret the directory's page showed, or the request's own when it carried one. */
export const INTEGRATION_USER_SETUP_ANSWER = z.object({ totpSecret: z.string().min(1) });

/** `connection` is null the first time, and the stored one when renewing its session. */
export const CONNECTION_SIGN_IN_REQUEST = z.object({
  connector: z.string().min(1),
  integrationUser: INTEGRATION_USER,
  connection: CONNECTION.nullable(),
});

/** As a connection test's answer, with the whole connection: the settings and the new session. */
export const CONNECTION_SIGN_IN_ANSWER = z.object({
  details: CONNECTION_TEST_ANSWER.shape.details,
  connection: CONNECTION,
});

/** A connector error, answered with HTTP 200. */
export const CONNECTOR_ERROR_ANSWER = z.object({
  error: z.object({
    code: z.enum(CONNECTOR_ERROR_CODES),
    /** What a robot saw when it stopped, as a base64 PNG. */
    screenshot: z.string().max(MAX_SCREENSHOT_LENGTH).optional(),
  }),
  appCalls: APP_CALLS,
});

export type AppCall = z.infer<typeof APP_CALL>;
export type ConnectorCall = (typeof CONNECTOR_CALLS)[number];
export type IntegrationUserCall = (typeof INTEGRATION_USER_CALLS)[number];
export type ConnectorErrorCode = (typeof CONNECTOR_ERROR_CODES)[number];
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
export type AccountAction = (typeof ACCOUNT_ACTIONS)[number];
export type Connection = z.infer<typeof CONNECTION>;
export type ConnectionUpdate = z.infer<typeof CONNECTION_UPDATE>;
export type AppSession = z.infer<typeof APP_SESSION>;
export type Runtime = z.infer<typeof RUNTIME>;
export type ConnectionTestRequest = z.infer<typeof CONNECTION_TEST_REQUEST>;
export type ConnectionTestAnswer = z.infer<typeof CONNECTION_TEST_ANSWER>;
export type AccountsListRequest = z.infer<typeof ACCOUNTS_LIST_REQUEST>;
export type AccountsListAnswer = z.infer<typeof ACCOUNTS_LIST_ANSWER>;
export type ListedAccount = AccountsListAnswer["accounts"][number];
export type Invitation = z.infer<typeof INVITATION>;
export type AccountValues = ListedAccount["values"];
export type ActionRunRequest = z.infer<typeof ACTION_RUN_REQUEST>;
export type ActionRunAnswer = z.infer<typeof ACTION_RUN_ANSWER>;
export type IntegrationUser = z.infer<typeof INTEGRATION_USER>;
export type IntegrationUserSetupRequest = z.infer<typeof INTEGRATION_USER_SETUP_REQUEST>;
export type IntegrationUserSetupAnswer = z.infer<typeof INTEGRATION_USER_SETUP_ANSWER>;
export type ConnectionSignInRequest = z.infer<typeof CONNECTION_SIGN_IN_REQUEST>;
export type ConnectionSignInAnswer = z.infer<typeof CONNECTION_SIGN_IN_ANSWER>;
export type ConnectorErrorAnswer = z.infer<typeof CONNECTOR_ERROR_ANSWER>;
