import {
  canChangeAccounts,
  type AccountAction,
  type ConnectorRegistry,
} from "../../../core/connectors";
import type { Orm, Tx } from "../../../core/db";
import { type AppConnection, accountChangeRepository, appConnectionRepository } from "../db";
import { type AccountChange, type AppAccount, offeredChange, offersReconnect } from "../domain";
import type { ConnectionMember } from "../ports";
import type { AccountChangeDependencies } from "./accountChangeService";

/** What decides each account's Disable or Enable, by account id, read in one go. */
export async function readAccountFacts(
  dependencies: AccountChangeDependencies,
  db: Orm | Tx,
  accounts: readonly AppAccount[],
  changing: Set<string>,
): Promise<Map<string, AccountFacts>> {
  return gatherFacts(accounts, await readFacts(dependencies, db, accounts), changing);
}

/** What the accounts' offers are decided from: their apps' connections, members and latest changes. */
interface StoredFacts {
  connections: AppConnection[];
  members: ConnectionMember[];
  latest: AccountChange[];
}

async function readFacts(
  { members }: AccountChangeDependencies,
  db: Orm | Tx,
  accounts: readonly AppAccount[],
): Promise<StoredFacts> {
  const [connections, latest] = await Promise.all([
    appConnectionRepository(db).findByApps(accounts.map(({ appId }) => appId)),
    accountChangeRepository(db).findLatestOfAccounts(accounts.map(({ id }) => id)),
  ]);
  const found = await members.findConnectionMembers(db, {
    connectionIds: connections.map(({ id }) => id),
    emails: accounts.map(({ email }) => email),
  });
  return { connections, members: found, latest };
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
  { connections, members, latest }: StoredFacts,
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
      const offerFacts = {
        status: account.status,
        connection: connection && {
          status: connection.status,
          changesAccounts: changing.has(connection.connector),
        },
        record: member && { isConnectionUser },
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
