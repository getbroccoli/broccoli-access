import type { Resolvers } from "../../../core/graphql";
import { toEnum } from "../../../core/graphql";
import type { ScanService } from "../app";
import type { Scan } from "../domain";

export function createResolvers(scans: Pick<ScanService, "readScan">): Resolvers {
  return {
    GoogleWorkspaceConnection: {
      scan: async (connection, _args, context) => {
        const scan = await scans.readScan(context.getActor(), connection.id);
        return scan && toScanGraphql(scan);
      },
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
