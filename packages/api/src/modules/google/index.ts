import { readSdl } from "../../core/graphql";
import type { ModuleManifest } from "../../core/moduleManifest";
import { createGoogleConnectionService, type GoogleConnectionDependencies } from "./app";
import { createResolvers } from "./graphql";
import { googleRouter } from "./http";

// Public values.
export { createGoogleConnectionService, createGoogleWorkspaceConnector } from "./app";

// Public types.
export type { GoogleConnectionService } from "./app";

/** Google Workspace connected with the instance's own Google app: the consent at setup and Google's redirect. */
export function googleModule(dependencies: GoogleConnectionDependencies): ModuleManifest {
  const google = createGoogleConnectionService(dependencies);
  return {
    name: "google",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(google),
    router: (http) => googleRouter(google, http, dependencies.logger),
  };
}
