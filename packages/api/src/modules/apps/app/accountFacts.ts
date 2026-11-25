import {
  canChangeAccounts,
  type AccountAction,
  type ConnectorRegistry,
} from "../../../core/connectors";
import type { Orm, Tx } from "../../../core/db";
import { parseUuid } from "../../../utils";
import type { SecurityContext } from "../../../core/security";
import {
  type AppConnection,
  appAccountRepository,
  accountChangeRepository,
  appConnectionRepository,
} from "../db";
import {
  type AccountChange,
  type AppAccount,
  isAutomaticService,
  offeredChange,
  offersReconnect,
} from "../domain";
import type { ConnectionMember } from "../ports";
import type { AccountChangeDependencies } from "./accountChangeService";

/** The common authorised read behind the offer and the full account-change state. */
export async function readChangeFacts(
  dependencies: AccountChangeDependencies,
  ctx: SecurityContext,
  db: Orm,
  ids: readonly string[],
) {
  ctx.require("MANAGE_WORKSPACE");
  const accounts = await appAccountRepository(db).findByIds(
    ids.flatMap((id) => parseUuid(id) ?? []),
  );
  return readAccountFacts(dependencies, db, accounts);
}

/** What decides each account's Disable or Enable, by account id, read in one go. */
export async function readAccountFacts(
  dependencies: AccountChangeDependencies,
  db: Orm | Tx,
  accounts: readonly AppAccount[],
  changing?: Set<string>,
): Promise<Map<string, AccountFacts>> {
  const stored = await readFacts(dependencies, db, accounts);
  // The connector list can take a network round trip. No member means no action.
  const capabilities =
    changing ??
    (stored.members.length ? await changingConnectors(dependencies.connectors) : new Set<string>());
  return gatherFacts(accounts, stored, capabilities);
}

/** What the accounts' offers are decided from: their apps' connections, members and latest changes. */
interface StoredFacts {
  connections: AppConnection[];
  members: ConnectionMember[];
  latest: AccountChange[];
  /** The integration user's email in apps; null while nothing tells which accounts are its own. */
  integrationEmail: string | null;
}

async function readFacts(
  { members, integrationUser }: AccountChangeDependencies,
  db: Orm | Tx,
  accounts: readonly AppAccount[],
): Promise<StoredFacts> {
  const [connections, latest, integrationEmail] = await Promise.all([
    appConnectionRepository(db).findByApps(accounts.map(({ appId }) => appId)),
    accountChangeRepository(db).findLatestOfAccounts(accounts.map(({ id }) => id)),
    integrationUser.findIntegrationAccountEmail(db),
  ]);
  const found = await members.findConnectionMembers(db, {
    connectionIds: connections.map(({ id }) => id),
    emails: accounts.map(({ email }) => email),
  });
  return { connections, members: found, latest, integrationEmail };
}

/** What decides each account's offer: its app's connection, the connection's member and its latest change. */
export interface AccountFacts {
  connection: AppConnection | null;
  /** Whether a member with the account's email is the connection's own user. */
  isConnectionUser: boolean;
  /** Null when the connection's last scan has no member with the account's email, or several. */
  member: ConnectionMember | null;
  latest: AccountChange | null;
  offered: AccountAction | null;
  /** Whether Reconnect shows instead of Disable or Enable. */
  reconnectOffered: boolean;
}

function gatherFacts(
  accounts: readonly AppAccount[],
  { connections, members, latest, integrationEmail }: StoredFacts,
  changing: Set<string>,
): Map<string, AccountFacts> {
  const connectionByApp = new Map(connections.map((connection) => [connection.appId, connection]));
  const membersByKey = Map.groupBy(
    members,
    ({ connectionId, email }) => `${connectionId} ${email}`,
  );
  const latestByAccount = new Map(latest.map((change) => [change.appAccountId, change]));
  return new Map(
    accounts.map((account) => {
      const connection = connectionByApp.get(account.appId) ?? null;
      const matches = connection
        ? membersByKey.get(`${connection.id} ${account.email}`)
        : undefined;
      // Two members sharing the email leave the change's target unclear.
      const member = matches?.length === 1 ? matches[0]! : null;
      const isConnectionUser = matches?.some((match) => match.isConnectionUser) ?? false;
      const change = latestByAccount.get(account.id) ?? null;
      // Whatever the owner marked it as: a change would lock Broccoli Access out of the app.
      const isIntegrationUsers = isAutomaticService(account) || account.email === integrationEmail;
      const offerFacts = {
        status: account.status,
        connection: connection && {
          status: connection.status,
          changesAccounts: changing.has(connection.connector),
        },
        record: member && !isIntegrationUsers ? { isConnectionUser } : null,
        changeRunning: change?.status === "running",
      };
      return [
        account.id,
        {
          connection,
          isConnectionUser,
          member,
          latest: change,
          offered: offeredChange(offerFacts),
          reconnectOffered: offersReconnect(offerFacts),
        },
      ];
    }),
  );
}

/** The keys of the connectors that list `suspend` and `reactivate`. */
export async function changingConnectors(connectors: ConnectorRegistry): Promise<Set<string>> {
  const listed = await connectors.list();
  return new Set(listed.filter((connector) => canChangeAccounts(connector)).map(({ key }) => key));
}
