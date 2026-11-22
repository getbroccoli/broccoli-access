import { readSdl } from "../../core/graphql";
import { PrincipalSecurityContext } from "../../core/security";
import type { ModuleManifest } from "../../core/moduleManifest";
import type { ScanService } from "./app";
import { createResolvers } from "./graphql";

// Public values.
export { createScanService } from "./app";

// Public types.
export type { ScanDependencies, ScanService } from "./app";

/** Scans of connected apps into import sources, and the sync of what they find. */
export function importsModule(scans: ScanService): ModuleManifest {
  return {
    name: "imports",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(scans),
    jobs: {
      "imports.scanConnection": {
        run: ({ sourceId }) => scans.runScan(SYSTEM, sourceId),
        onFailed: ({ sourceId }) => scans.failScan(SYSTEM, sourceId),
        expireInSeconds: SCAN_EXPIRE_SECONDS,
      },
    },
  };
}

/** Longer than a large directory's pages with every retry, so a slow scan never runs twice at once. */
const SCAN_EXPIRE_SECONDS = 15 * 60;

const SYSTEM = PrincipalSecurityContext.system();
