import { z } from "zod";

/** The calls that carry a connection, by their path after `/v1/`. */
export const CONNECTOR_CALLS = ["connections/test", "accounts/list", "actions/run"] as const;

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
] as const;

/** Whether the member may use their account in the app; pending invitations are not members. */
export const ACCOUNT_STATUSES = ["active", "suspended"] as const;

/** The changes `actions/run` makes to one member. */
export const ACCOUNT_ACTIONS = ["suspend", "reactivate"] as const;

/**
 * The longest screenshot an error carries: 1 MB of PNG as base64, which takes four characters
 * for every three bytes.
 */
const MAX_SCREENSHOT_LENGTH = Math.ceil((1024 * 1024) / 3) * 4;

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
  nextCursor: z.string().nullable(),
  connection: CONNECTION_UPDATE.optional(),
});

export const ACTION_RUN_REQUEST = CALL.extend({
  action: z.enum(ACCOUNT_ACTIONS),
  account: z.object({ sourceKey: z.string().min(1), email: EMAIL }),
});

/** The member as read again after the change, and whether anything changed. */
export const ACTION_RUN_ANSWER = z.object({
  changed: z.boolean(),
  account: z.object({ sourceKey: z.string().min(1), values: ACCOUNT_VALUES }),
  connection: CONNECTION_UPDATE.optional(),
});

/** A connector error, answered with HTTP 200. */
export const CONNECTOR_ERROR_ANSWER = z.object({
  error: z.object({
    code: z.enum(CONNECTOR_ERROR_CODES),
    /** What a robot saw when it stopped, as a base64 PNG. */
    screenshot: z.string().max(MAX_SCREENSHOT_LENGTH).optional(),
  }),
});

export type ConnectorCall = (typeof CONNECTOR_CALLS)[number];
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
export type AccountValues = ListedAccount["values"];
export type ActionRunRequest = z.infer<typeof ACTION_RUN_REQUEST>;
export type ActionRunAnswer = z.infer<typeof ACTION_RUN_ANSWER>;
export type ConnectorErrorAnswer = z.infer<typeof CONNECTOR_ERROR_ANSWER>;
