import { readSdl } from "../../core/graphql";
import type { ModuleManifest } from "../../core/moduleManifest";
import type { AppService, AppUserService } from "./app";
import { createResolvers } from "./graphql";

// Public values.
export {
  createAppAccountService,
  createAppConnectionService,
  createAppService,
  createAppUserService,
} from "./app";

// Public types.
export type { AppAccountService, AppConnectionService, AppService, AppUserService } from "./app";

/** The apps people use and their users: found by scans or connected, and approved or ignored by the owner. */
export function appsModule(apps: AppService & AppUserService): ModuleManifest {
  return {
    name: "apps",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(apps),
  };
}
