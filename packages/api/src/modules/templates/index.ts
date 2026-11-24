import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import { createTemplateService } from "./app";
import { createResolvers } from "./graphql";
import type { AppsById } from "./ports";

// Public values.
export { createTemplateService } from "./app";

// Public types.
export type { TemplateService } from "./app";

/** Templates, the named lists of apps: create, rename and delete them, and add and take out apps. */
export function templatesModule(
  dependencies: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & { apps: AppsById },
): ModuleManifest {
  return {
    name: "templates",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(createTemplateService(dependencies)),
  };
}
