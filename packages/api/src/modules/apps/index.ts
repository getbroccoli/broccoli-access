import { readSdl } from "../../core/graphql";
import type { ModuleManifest } from "../../core/moduleManifest";
import type { AppService } from "./app";
import { createResolvers } from "./graphql";

// Public values.
export { createAppAccountService, createAppConnectionService, createAppService } from "./app";

// Public types.
export type { AppAccountService, AppConnectionService, AppService } from "./app";

/** The apps people use: found by scans or connected, and approved or ignored by the owner. */
export function appsModule(apps: AppService): ModuleManifest {
  return {
    name: "apps",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(apps),
  };
}
