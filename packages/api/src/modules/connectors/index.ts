import { readSdl } from "../../core/graphql";
import type { ModuleManifest } from "../../core/moduleManifest";
import type { ContainerConnectionService } from "./app";
import { createResolvers } from "./graphql";

// Public values.
export {
  createContainerConnectionService,
  createContainerConnectors,
  createSessionRenewals,
} from "./app";

/**
 * Apps connected through the connectors container, with no code for any of them. It shares the
 * connection service with the extension module, which hands over app sessions into it.
 */
export function connectorsModule(connections: ContainerConnectionService): ModuleManifest {
  return {
    name: "connectors",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(connections),
  };
}
