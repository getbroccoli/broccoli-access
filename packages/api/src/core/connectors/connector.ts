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
  transport: "api";
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
  /** What the UI calls the connection's import source, such as the Google domain. */
  sourceName(settings: unknown): string;
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

/** A connection signed in to its app; each call fails with a `ConnectorError` only. */
export interface ConnectorSession {
  /** What Settings shows about the connected account. */
  testConnection(): Promise<ConnectionDetails>;
  /** One page of accounts, starting from a null cursor; `nextCursor` is null on the last page. */
  listAccounts(cursor: string | null): Promise<AccountPage>;
  /** The photo of the directory account with this source key; null when it has none. */
  readPhoto?(sourceKey: string): Promise<AccountPhoto | null>;
}

export interface ConnectionDetails {
  organizationName: string;
  /** Null for an app without a domain. */
  domain: string | null;
}

export interface AccountPage {
  accounts: ImportedAccount[];
  nextCursor: string | null;
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
}

/** Whether the person may use their account in the app. */
export const ACCOUNT_STATUSES = ["active", "suspended"] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** A person's photo as the app gave it, in an image format browsers show. */
export interface AccountPhoto {
  content: Buffer;
  mimeType: string;
}

/** The version of `AccountValues` the import records store. */
export const ACCOUNT_VALUES_VERSION = 1;

/** Why a connector failed; it never passes on the app's raw answer. */
export const CONNECTOR_ERROR_CODES = [
  "authentication_failed",
  "permission_missing",
  "rate_limited",
  "app_unavailable",
  "unexpected_response",
] as const;

export type ConnectorErrorCode = (typeof CONNECTOR_ERROR_CODES)[number];

/** Failures that pass on their own, so the scan tries the call again before failing. */
export const RETRIED_CONNECTOR_ERRORS: readonly ConnectorErrorCode[] = [
  "rate_limited",
  "app_unavailable",
];

/** A connector's failure, carrying only its code: no response, URL or token. */
export class ConnectorError extends Error {
  constructor(readonly code: ConnectorErrorCode) {
    super(`The connector failed: ${code}`);
    this.name = "ConnectorError";
  }
}
