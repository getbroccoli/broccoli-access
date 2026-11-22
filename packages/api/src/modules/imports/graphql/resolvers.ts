import type { GraphqlContext, Resolvers } from "../../../core/graphql";
import { toEnum } from "../../../core/graphql";
import type { ScanService } from "../app";
import type { Scan } from "../domain";

export function createResolvers(
  scans: Pick<ScanService, "readScan" | "scanNow" | "readConnectionUserEmail">,
): Resolvers {
  const scanOfConnection = async (connectionId: string, context: GraphqlContext) => {
    const scan = await scans.readScan(context.getActor(), connectionId);
    return scan && toScanGraphql(scan);
  };
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
        scans.readConnectionUserEmail(context.getActor(), connection.id),
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
