import DataLoader from "dataloader";

import type { GraphqlContext, Resolvers } from "../../../core/graphql";
import { perRequest, toEnum } from "../../../core/graphql";
import type { ScanService } from "../app";
import type { Scan } from "../domain";

export function createResolvers(
  scans: Pick<ScanService, "readScan" | "scanNow" | "readConnectionUserEmail">,
): Resolvers {
  // shortcut: one read per connection, cached for the request since every row of an app page reads
  // its app's scan; batch the reads if a page ever lists many connections.
  const scansOfConnections = perRequest(
    (context) =>
      new DataLoader<string, ReturnType<typeof toScanGraphql> | null>((connectionIds) =>
        Promise.all(
          connectionIds.map(async (connectionId) => {
            const scan = await scans.readScan(context.getActor(), connectionId);
            return scan && toScanGraphql(scan);
          }),
        ),
      ),
  );
  const scanOfConnection = (connectionId: string, context: GraphqlContext) =>
    scansOfConnections(context).load(connectionId);
  // Cached for the request like the scans: every row of an app page reads its connection's user.
  const connectionUserEmails = perRequest(
    (context) =>
      new DataLoader<string, string | null>((connectionIds) =>
        Promise.all(
          connectionIds.map((connectionId) =>
            scans.readConnectionUserEmail(context.getActor(), connectionId),
          ),
        ),
      ),
  );
  return {
    Mutation: {
      imports: () => ({}),
    },
    ImportsMutations: {
      scanConnection: async (_parent, { connectionId }, context) => ({
        scan: toScanGraphql(await scans.scanNow(context.getActor(), connectionId)),
      }),
    },
    GoogleWorkspaceConnection: {
      scan: (connection, _args, context) => scanOfConnection(connection.id, context),
    },
    ContainerConnection: {
      scan: (connection, _args, context) => scanOfConnection(connection.id, context),
      connectionUserEmail: (connection, _args, context) =>
        connectionUserEmails(context).load(connection.id),
    },
  };
}

function toScanGraphql({ failure, people, apps, signInLogs, status, ...scan }: Scan) {
  return {
    ...scan,
    status: toEnum(status),
    failure: failure && toEnum(failure),
    people: { ...people, state: toEnum(people.state) },
    apps: { ...apps, state: toEnum(apps.state) },
    signInLogs: { state: toEnum(signInLogs.state) },
  };
}
