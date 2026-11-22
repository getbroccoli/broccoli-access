import { readSdl } from "../../core/graphql";
import type { ModuleManifest } from "../../core/moduleManifest";
import { type ContainerConnectionDependencies, createContainerConnectionService } from "./app";
import { createResolvers } from "./graphql";

// Public values.
export { createContainerConnectionService, createContainerConnectors } from "./app";

/** Apps connected through the connectors container, with no code for any of them. */
export function connectorsModule(dependencies: ContainerConnectionDependencies): ModuleManifest {
  return {
    name: "connectors",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(createContainerConnectionService(dependencies)),
  };
}
