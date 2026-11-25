import type { SecurityContext } from "../security";
import { ConnectorError, type ConnectorErrorCode } from "./connector";

/** What signing in again gave: the connection's new secrets, or why it could not. */
export type SessionRenewal = { secrets: Record<string, unknown> } | { failure: ConnectorErrorCode };

/**
 * What a call needs to keep a connection made by signing in working: renewing its session, and
 * whether it may call the app at all. The connectors module implements it.
 */
export interface SessionRenewals {
  /**
   * Signs in again for the connection whose calls ended with `authentication_failed` using
   * `staleSecrets`, saves the new secrets and answers them; null for a connection that holds its
   * owner's own session, which cannot renew. One sign-in at a time per connection.
   */
  renew(
    ctx: SecurityContext,
    connectionId: string,
    staleSecrets: Record<string, unknown>,
  ): Promise<SessionRenewal | null>;
  /** Whether the connection must make no call: its integration user is suspended in the directory. */
  isStopped(connectionId: string): Promise<boolean>;
}

/** A connector error that signing in again answered, which no call of the app did. */
export class RenewalError extends ConnectorError {}

/**
 * A call that ended with `authentication_failed` again after signing in again succeeded: the call
 * fails, but the connection's session is not what ended, so it never turns to Reconnect.
 */
export class RenewedSessionRefusedError extends ConnectorError {}

/**
 * Runs `call`, and when it ends with `authentication_failed` signs in again once and runs it again
 * with the new secrets, which `onRenewed` hears first. A sign-in that fails throws a
 * `RenewalError` with its code; a connection that cannot renew throws the call's own error; a
 * second `authentication_failed` throws a `RenewedSessionRefusedError`.
 */
export async function callWithRenewal<T>(
  call: () => Promise<T>,
  {
    renewals,
    ctx,
    connectionId,
    secrets,
    onRenewed,
  }: {
    renewals: SessionRenewals;
    ctx: SecurityContext;
    connectionId: string;
    /** The secrets `call` uses now. */
    secrets: () => Record<string, unknown>;
    onRenewed: (secrets: Record<string, unknown>) => void;
  },
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (!(error instanceof ConnectorError) || error.code !== "authentication_failed") {
      throw error;
    }
    const renewal = await renewals.renew(ctx, connectionId, secrets());
    if (!renewal) {
      throw error;
    }
    if ("failure" in renewal) {
      throw new RenewalError(renewal.failure);
    }
    onRenewed(renewal.secrets);
    try {
      return await call();
    } catch (again) {
      if (again instanceof ConnectorError && again.code === "authentication_failed") {
        throw new RenewedSessionRefusedError(again.code);
      }
      throw again;
    }
  }
}
