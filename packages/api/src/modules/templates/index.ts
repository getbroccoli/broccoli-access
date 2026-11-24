import { readSdl } from "../../core/graphql";
import type { ModuleManifest } from "../../core/moduleManifest";
import { createTemplateService } from "./app";
import { createResolvers, type InviteLoader, type ReadTemplateEmployees } from "./graphql";

export { createTemplateService } from "./app";

/** Templates, their people, and the apps they give them. */
export function templatesModule(
  dependencies: Parameters<typeof createTemplateService>[0] & {
    invites: InviteLoader;
    employees: { readEmployees: ReadTemplateEmployees };
  },
): ModuleManifest {
  const service = createTemplateService(dependencies);
  return {
    name: "templates",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(service, dependencies.employees.readEmployees, dependencies.invites),
    async eventsBeforeCommit(tx, events) {
      const appIds = new Set<string>();
      for (const event of events) {
        if (event.type === "imports.appScanned") appIds.add(event.payload.appId);
        if (event.type === "apps.accountsChanged")
          for (const id of event.payload.appIds) appIds.add(id);
      }
      if (appIds.size) await service.clearInactiveReviews(tx, [...appIds]);
    },
  };
}
