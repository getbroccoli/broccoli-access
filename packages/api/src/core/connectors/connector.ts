import {
  type AccountAction as ContractAccountAction,
  type Capability,
  type ConnectorDescription,
  type ConnectorErrorCode as ContractErrorCode,
  type RuntimeKind,
} from "@broccoli-access/connector-contract";
import type { z } from "zod";

/**
 * A connector module's definition: what it reads and how. Every connector exports one in this
 * shape, so the scan reads any connected app the same way.
 */
export interface Connector {
  /** The connector key an app connection names, such as `google_workspace`. */
  key: string;
  version: number;
  name: string;
  /**
   * What it can do with its app's accounts: `list_accounts`, plus `suspend` and `reactivate` to
   * change them, `invite` to invite an email, and `list_invitations` to read the pending ones.
   */
  capabilities: readonly Capability[];
  /** The roles its manifest offers on Invite. */
  roles?: ConnectorDescription["roles"];
  /** Where its calls can run, in the order they are tried. */
  runtimes: readonly RuntimeKind[];
  /** The finding kinds it registers: what finds accounts of its own app, and of other apps. */
  findingKinds: { ownAppAccounts: string; otherAppAccounts?: string };
  /** Whether its app's accounts are the company's employees. */
  isDirectory: boolean;
  /** What a connection holds; a secret field is stored encrypted, the others in its settings. */
  connectionFields: readonly ConnectionField[];
  /** Checks a connection's stored settings. */
  settings: z.ZodType;
  /** Checks a connection's decrypted secrets. */
  secrets: z.ZodType;
  /** Checks the connection's settings and secrets and signs in to the app. */
  openSession(connection: { settings: unknown; secrets: unknown }): Promise<ConnectorSession>;
  /**
   * The version of a directory account's photo, read from its `raw`, which changes with the
   * photo; null without one. A directory whose sessions read photos has it.
   */
  photoVersion?(raw: Record<string, unknown>): string | null;
  /**
   * The account's `raw` without its photo version, saved when the photo's read failed so the next
   * scan reads it again. A connector with `photoVersion` has it.
   */
  withoutPhotoVersion?(raw: Record<string, unknown>): Record<string, unknown>;
}

export interface ConnectionField {
  key: string;
  secret: boolean;
}

/** Every connector the instance can use: the core's own, and the connectors container's. */
export interface ConnectorRegistry {
  /** Every connector now known; the container's join once its list has loaded. */
  list(): Promise<readonly Connector[]>;
}

/** A connection signed in to its app; each call fails with a `ConnectorError` only. */
export interface ConnectorSession {
  /** What Settings shows about the connected account. */
  testConnection(): Promise<ConnectionDetails>;
  /** One page of accounts, starting from a null cursor; `nextCursor` is null on the last page. */
  listAccounts(cursor: string | null): Promise<AccountPage>;
  /** The photo of the directory account with this source key; null when it has none. */
  readPhoto?(sourceKey: string): Promise<AccountPhoto | null>;
  /**
   * Suspends or reactivates one member, then reads it again. A connector that lists `suspend` and
   * `reactivate` has it.
   */
  runAction?(
    action: AccountAction,
    account: { sourceKey: string; email: string },
  ): Promise<ActionResult>;
  /** Removes the identified member and verifies their absence. */
  remove?(account: {
    sourceKey: string;
    email: string;
  }): Promise<{ connection?: ConnectionUpdate }>;
  /**
   * Invites the email as a member, unless it already has a member or a pending invitation, then
   * reads the invitation or the member back. A connector that lists `invite` has it.
   */
  invite?(email: string, role?: string): Promise<InviteResult>;
  /** Creates a directory account with a first password that the person must change. */
  createDirectoryAccount?(person: {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
  }): Promise<void>;
}

export interface ConnectionDetails {
  organizationName: string;
  /** Null for an app without a domain. */
  domain: string | null;
  /** New settings found by the test, such as the workspace's id. */
  connection?: ConnectionUpdate;
}

export interface AccountPage {
  accounts: ImportedAccount[];
  nextCursor: string | null;
  /** Renewed settings or secrets, saved before the page's accounts are used. */
  connection?: ConnectionUpdate;
  /** Pending invitations, on any page; only from a connector that lists `list_invitations`. */
  invitations?: PendingInvitation[];
}

/** An invitation to the app that nobody accepted yet; not a member. */
export interface PendingInvitation {
  /** Lowercased. */
  email: string;
  /** As the app gives it, as an ISO date-time; null when it does not. */
  invitedAt: string | null;
  expiresAt: string | null;
}

/** A member as read after an action. */
export interface ActionResult {
  status: AccountStatus;
  /** Renewed settings or secrets, saved before the result is used. */
  connection?: ConnectionUpdate;
}

/** An invite read back: the invitation, or the email's member. */
export interface InviteResult {
  /** Renewed settings or secrets, saved before the result is used. */
  connection?: ConnectionUpdate;
  /** The email's member, when the connector read it back. */
  account?: ImportedAccount;
  changed: boolean;
}

/** New settings or secrets an answer carries; each object it carries replaces the stored one. */
export interface ConnectionUpdate {
  settings?: Record<string, unknown>;
  secrets?: Record<string, unknown>;
}

/** One account as an import record of type `app_account`, at `ACCOUNT_VALUES_VERSION`. */
export interface ImportedAccount {
  /** The app's own id for the account, unique within the source. */
  sourceKey: string;
  /** The account as the app sent it. */
  raw: Record<string, unknown>;
  values: AccountValues;
}

export interface AccountValues {
  /** The member's name in a container app; null for Google and older import records. */
  displayName: string | null;
  /** Lowercased. */
  email: string;
  status: AccountStatus;
  /** Given by the directory, null elsewhere. */
  firstName: string | null;
  lastName: string | null;
  /** Lowercased; given by the directory, null elsewhere. */
  managerEmail: string | null;
  appName: string;
  /** How the source names another app, such as `google:<client id>`; null for its own app. */
  appExternalId: string | null;
  /** When the person granted the app access, from the source's log, as an ISO date-time. */
  grantedAt: string | null;
  /** Set only when the grant is older than the log: the earliest moment the log covered. */
  grantedBefore: string | null;
  /** The member whose key or session the connection uses; false in version 1 records. */
  isConnectionUser: boolean;
}

/** Disable (`suspend`) or Enable (`reactivate`): the contract's actions the core sends. */
export type AccountAction = Extract<ContractAccountAction, "suspend" | "reactivate">;

/** Whether the person may use their account in the app. */
export const ACCOUNT_STATUSES = ["active", "suspended"] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** A person's photo as the app gave it, in an image format browsers show. */
export interface AccountPhoto {
  content: Buffer;
  mimeType: string;
}

/**
 * Who made a connection's app session: `extension`, the owner's own, handed over; or
 * `server_sign_in`, the integration user's, made by signing in as it.
 */
export const APP_SESSION_SOURCES = ["extension", "server_sign_in"] as const;

export type AppSessionSource = (typeof APP_SESSION_SOURCES)[number];

/** The version of `AccountValues` the import records store. */
export const ACCOUNT_VALUES_VERSION = 3;

/**
 * Why a connector failed; it never passes on the app's raw answer. The connectors container's own
 * codes, such as `wrong_workspace`, come from the connector contract, except `not_invited`: only
 * signing in as the integration user gives it, which is no connector session's call.
 */
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
] as const satisfies readonly ContractErrorCode[];

export type ConnectorErrorCode = (typeof CONNECTOR_ERROR_CODES)[number];

/** A connector's failure, carrying only its code: no response, URL or token. */
export class ConnectorError extends Error {
  constructor(readonly code: ConnectorErrorCode) {
    super(`The connector failed: ${code}`);
    this.name = "ConnectorError";
  }
}

/** The container gave no usable HTTP reply, so the app may have acted. */
export class ConnectorAnswerLostError extends ConnectorError {
  constructor() {
    super("app_unavailable");
  }
}

/** Whether the core can read the app's accounts on the server. */
export function canListAccounts({
  capabilities,
  runtimes,
}: Pick<Connector, "capabilities" | "runtimes">): boolean {
  return capabilities.includes("list_accounts") && runtimes.includes("server");
}

/**
 * Whether it can disable and enable its app's accounts: it lists both `suspend` and `reactivate`,
 * and the `server` runtime, the only one the core calls them on yet.
 */
export function canChangeAccounts({
  capabilities,
  runtimes,
}: Pick<Connector, "capabilities" | "runtimes">): boolean {
  return (
    capabilities.includes("suspend") &&
    capabilities.includes("reactivate") &&
    runtimes.includes("server")
  );
}

/** Whether the connector can remove a member on the server. */
export function canRemoveAccounts({
  capabilities,
  runtimes,
}: Pick<Connector, "capabilities" | "runtimes">): boolean {
  return capabilities.includes("remove") && runtimes.includes("server");
}

/** Whether it can invite an email to its app: it lists `invite` and the `server` runtime. */
export function canInvite({
  capabilities,
  runtimes,
}: Pick<Connector, "capabilities" | "runtimes">): boolean {
  return capabilities.includes("invite") && runtimes.includes("server");
}

/** Null asks for the default, even on a connector that does not list roles. */
export function offersInviteRole(roles: Connector["roles"], role: string | null): boolean {
  return role === null || !!roles?.some(({ key }) => key === role);
}

/** Whether Broccoli Access can sign in to its app as the integration user: it lists `sign_in`. */
export function signsInAsIntegrationUser({
  capabilities,
}: Pick<Connector, "capabilities">): boolean {
  return capabilities.includes("sign_in");
}

/** Whether its scans read the app's pending invitations: it lists `list_invitations`. */
export function listsInvitations({ capabilities }: Pick<Connector, "capabilities">): boolean {
  return capabilities.includes("list_invitations");
}
