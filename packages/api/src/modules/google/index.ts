import { readSdl } from "../../core/graphql";
import type { ModuleManifest } from "../../core/moduleManifest";
import {
  createGoogleConnectionService,
  createGoogleSignInService,
  createUserWriteConsentService,
  type GoogleConnectionDependencies,
  type IntegrationUserService,
} from "./app";
import { createResolvers } from "./graphql";
import { googleRouter } from "./http";

// Public values.
export {
  createGoogleConnectionService,
  createGoogleSignInService,
  createGoogleWorkspaceConnector,
  createIntegrationUserService,
  createUserWriteConsentService,
} from "./app";

// Public types.
export type { GoogleConnectionService } from "./app";

/**
 * Google Workspace connected with either Google app: the consent at setup, signing in
 * with Google after it, creating the integration user, allowing changes to its users, and
 * Google's redirect for them all.
 */
export function googleModule(
  dependencies: GoogleConnectionDependencies & {
    /** The one the scans read too, built by the composition root. */
    integrationUsers: IntegrationUserService;
  },
): ModuleManifest {
  const { integrationUsers } = dependencies;
  const connection = createGoogleConnectionService(dependencies);
  const signIn = createGoogleSignInService(dependencies);
  const userWrites = createUserWriteConsentService(dependencies);
  return {
    name: "google",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(connection, Boolean(dependencies.relayUrl), integrationUsers),
    router: (http) =>
      googleRouter({ connection, signIn, integrationUsers, userWrites }, http, dependencies.logger),
  };
}
