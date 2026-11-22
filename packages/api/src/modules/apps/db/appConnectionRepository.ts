import { eq, sql } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import { appConnections } from "./appConnectionsTable";

/** A connection as stored, without its secrets. */
export interface AppConnection {
  id: string;
  connector: string;
  appId: string;
  settings: Record<string, unknown>;
  connectedAt: Date;
}

/** App connections in Postgres, through the pool or inside a transaction. */
export interface AppConnectionRepository {
  /** A new connection id, which encrypts the secrets before the insert. */
  newId(): Promise<string>;
  insert(connection: {
    id: string;
    connector: string;
    appId: string;
    settings: Record<string, unknown>;
    encryptedSecrets: string;
  }): Promise<AppConnection>;
  findByConnector(connector: string): Promise<AppConnection | null>;
}

export function appConnectionRepository(db: Orm | Tx): AppConnectionRepository {
  const orm = () => ormOf(db);
  return {
    newId: async () => {
      // Postgres makes every id of this database, so connection ids sort like the others.
      const { rows } = await orm().execute<{ id: string }>(sql`select uuidv7() as id`);
      return rows[0]!.id;
    },
    insert: async (connection) => {
      const [stored] = await orm().insert(appConnections).values(connection).returning(columns);
      return stored!;
    },
    findByConnector: async (connector) => {
      const [connection] = await orm()
        .select(columns)
        .from(appConnections)
        .where(eq(appConnections.connector, connector));
      return connection ?? null;
    },
  };
}

const columns = {
  id: appConnections.id,
  connector: appConnections.connector,
  appId: appConnections.appId,
  settings: appConnections.settings,
  connectedAt: appConnections.connectedAt,
};
