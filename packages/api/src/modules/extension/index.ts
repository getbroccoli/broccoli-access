import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import { createExtensionHandOverService, createExtensionPairingService } from "./app";
import { createResolvers } from "./graphql";
import { extensionRouter } from "./http";
import type { AppSessions } from "./ports";

// Public values.
export { createExtensionPairingService } from "./app";

// Public types.
export type { ExtensionPairingService } from "./app";

/**
 * The Chrome extension paired with the instance: the owner pairs and unpairs it, and it calls in
 * with its token, such as to hand over an app session.
 */
export function extensionModule(
  dependencies: Pick<ModuleDependencies, "orm" | "secretBox" | "logger"> & {
    appSessions: AppSessions;
  },
): ModuleManifest {
  const pairings = createExtensionPairingService(dependencies);
  const handOvers = createExtensionHandOverService({ ...dependencies, pairings });
  return {
    name: "extension",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(pairings),
    router: () => extensionRouter({ pairings, handOvers }, dependencies.logger),
  };
}
