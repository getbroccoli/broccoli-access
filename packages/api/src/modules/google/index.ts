import { readSdl } from "../../core/graphql";
import type { ModuleManifest } from "../../core/moduleManifest";
import {
  createGoogleConnectionService,
  createGoogleSignInService,
  type GoogleConnectionDependencies,
} from "./app";
import { createResolvers } from "./graphql";
import { googleRouter } from "./http";

// Public values.
export {
  createGoogleConnectionService,
  createGoogleSignInService,
  createGoogleWorkspaceConnector,
} from "./app";

// Public types.
export type { GoogleConnectionService } from "./app";

/**
 * Google Workspace connected with either Google app: the consent at setup, signing in
 * with Google after it, and Google's redirect for both.
 */
export function googleModule(dependencies: GoogleConnectionDependencies): ModuleManifest {
  const connection = createGoogleConnectionService(dependencies);
  const signIn = createGoogleSignInService(dependencies);
  return {
    name: "google",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(connection, Boolean(dependencies.relayUrl)),
    router: (http) => googleRouter({ connection, signIn }, http, dependencies.logger),
  };
}
