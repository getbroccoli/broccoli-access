import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import { createExtensionPairingService } from "./app";
import { createResolvers } from "./graphql";
import { extensionRouter } from "./http";

// Public values.
export { createExtensionPairingService } from "./app";

// Public types.
export type { ExtensionPairingService } from "./app";

/** The Chrome extension paired with the instance: the owner pairs and unpairs it, and it calls in with its token. */
export function extensionModule(
  dependencies: Pick<ModuleDependencies, "orm" | "secretBox" | "logger">,
): ModuleManifest {
  const pairings = createExtensionPairingService(dependencies);
  return {
    name: "extension",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(pairings),
    router: () => extensionRouter(pairings, dependencies.logger),
  };
}
