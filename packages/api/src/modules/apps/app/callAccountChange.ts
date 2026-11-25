import {
  type ConnectionUpdate,
  type Connector,
  callWithRenewal,
  ConnectorAnswerLostError,
  ConnectorError,
  type ConnectorErrorCode,
  type ConnectorSession,
  type ImportedAccount,
  RenewalError,
  RenewedSessionRefusedError,
  withConnectorRetries,
} from "../../../core/connectors";
import type { SecurityContext } from "../../../core/security";
import { statusAfter } from "../domain";
import type { RunDependencies, RunnableChange } from "./runAccountChange";

/** How the action ended: its error, null once the member read back changed; and whether the server was called. */
export interface ActionOutcome {
  error: ConnectorErrorCode | null;
  calledServer: boolean;
  /** The secrets its call used; null when it made none. */
  secretsUsed: Record<string, unknown> | null;
  /** Whether its connection turns to Reconnect on an error that needs it: never the directory's. */
  reconnects: boolean;
  /** Whether the error is what signing in again answered, which turns Reconnect with a check too. */
  afterRenewal?: boolean;
  /** The member an invite added, with the finding kind its connection uses. */
  invitedMember?: InvitedMember;
}

export interface InvitedMember {
  account: ImportedAccount;
  findingKind: string;
}

/** An outcome decided before any call to the app. */
export const NOT_CALLED = { calledServer: false, secretsUsed: null } as const;

/**
 * Makes the change on the server with the connection's session, signing in again once when it
 * ended and the connection was made by signing in; a connection whose integration user the
 * directory shows suspended makes no call.
 */
export async function callChange(
  dependencies: RunDependencies,
  ctx: SecurityContext,
  change: RunnableChange,
  call: ChangeCall,
): Promise<ActionOutcome> {
  const { renewals, logger } = dependencies;
  const { secrets, reconnects } = call;
  // The integration user suspended in the directory cannot sign in: no call, no sign-in.
  if (reconnects && (await renewals.isStopped(change.connectionId))) {
    logger.warn(
      { changeId: change.id, connectionId: change.connectionId },
      "Account change not called: the integration user is suspended in the directory",
    );
    return { ...NOT_CALLED, secretsUsed: secrets, error: "authentication_failed", reconnects };
  }
  const progress = { calledServer: false, inviteAnswerLost: false, inUse: secrets };
  try {
    const result = await callWithRenewal(() => callOnce(dependencies, change, call, progress), {
      renewals,
      ctx,
      connectionId: change.connectionId,
      secrets: () => progress.inUse,
      onRenewed: (renewed) => {
        progress.inUse = renewed;
      },
    });
    await saveConnectionUpdate(dependencies, ctx, change, {
      ...result.connection,
      replacing: progress.inUse,
    });
    return {
      error: result.readBack ? null : "unexpected_response",
      calledServer: progress.calledServer,
      secretsUsed: progress.inUse,
      reconnects,
      invitedMember: result.account && {
        account: result.account,
        findingKind: call.connector.findingKinds.ownAppAccounts,
      },
    };
  } catch (error) {
    if (error instanceof ConnectorError) {
      return {
        error: error.code,
        calledServer: progress.calledServer,
        secretsUsed: progress.inUse,
        // A session that signing in again just made and the app still refuses is no reason to reconnect.
        reconnects: reconnects && !(error instanceof RenewedSessionRefusedError),
        afterRenewal: error instanceof RenewalError,
      };
    }
    throw error;
  }
}

/** What a change's call uses: the connector, the stored connection and its secrets. */
interface ChangeCall {
  connector: Connector;
  connection: { settings: Record<string, unknown> };
  secrets: Record<string, unknown>;
  reconnects: boolean;
}

interface CallProgress {
  calledServer: boolean;
  inviteAnswerLost: boolean;
  inUse: Record<string, unknown>;
}

/** One attempt with the secrets in use, trying a rate-limited or unavailable call again. */
async function callOnce(
  { wait, logger }: RunDependencies,
  change: RunnableChange,
  { connector, connection }: ChangeCall,
  progress: CallProgress,
) {
  const session = await connector.openSession({
    settings: connection.settings,
    secrets: progress.inUse,
  });
  return withConnectorRetries(
    async () => {
      progress.calledServer = true;
      try {
        return await makeChange(session, change, progress.inviteAnswerLost);
      } catch (error) {
        if (error instanceof ConnectorAnswerLostError) progress.inviteAnswerLost = true;
        throw error;
      }
    },
    {
      wait,
      onRetry: (failure, attempt) =>
        logger.info(
          { changeId: change.id, failure, attempt },
          "Account change call failed; trying again",
        ),
    },
  );
}

/**
 * Makes the change in one call and tells whether it read back: the member's new status, or for an
 * invite, the invitation or the email's member, which the session checks. Success is what is read
 * back, never a call that went through.
 */
async function makeChange(
  session: ConnectorSession,
  change: RunnableChange,
  inviteAnswerLost: boolean,
): Promise<{ readBack: boolean; connection?: ConnectionUpdate; account?: ImportedAccount }> {
  if (change.action === "invite") {
    const { connection, account, changed } = await session.invite!(
      change.email,
      change.role ?? undefined,
    );
    // shortcut: the next scan reconciles an invite whose job ended before it saved the read-back.
    return {
      connection,
      readBack: true,
      account:
        (changed || inviteAnswerLost) && account?.values.status === "active" ? account : undefined,
    };
  }
  // A change to an existing account always copies the member's source key.
  const account = { sourceKey: change.sourceKey!, email: change.email };
  if (change.action === "remove") return { ...(await session.remove!(account)), readBack: true };
  const { status, connection } = await session.runAction!(change.action, account);
  return { readBack: status === statusAfter(change.action), connection };
}

/** Saves what the answer renewed, unless a reconnect replaced the secrets its call used meanwhile. */
async function saveConnectionUpdate(
  { transact, connections, logger }: RunDependencies,
  ctx: SecurityContext,
  change: RunnableChange,
  update: ConnectionUpdate & { replacing: Record<string, unknown> },
): Promise<void> {
  if (!update.settings && !update.secrets) {
    return;
  }
  const saved = await transact((tx) =>
    connections.changeConnection(ctx, tx, change.connectionId, update),
  );
  logger.info(
    { changeId: change.id, connectionId: change.connectionId, saved },
    "Account change answered with renewed settings or secrets",
  );
}
