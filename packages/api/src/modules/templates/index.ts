import { readSdl } from "../../core/graphql";
import type { ModuleManifest } from "../../core/moduleManifest";
import { createTemplateService } from "./app";
import { createResolvers, type ReadTemplateEmployees } from "./graphql";

export { createTemplateService } from "./app";

/** Templates, their people, and the apps they give them. */
export function templatesModule(
  dependencies: Parameters<typeof createTemplateService>[0] & {
    employees: { readEmployees: ReadTemplateEmployees };
  },
): ModuleManifest {
  const service = createTemplateService(dependencies);
  return {
    name: "templates",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(service, dependencies.employees.readEmployees),
    async eventsBeforeCommit(tx, events) {
      if (
        events.some(
          (event) => event.type === "records.changed" && event.payload.recordType === "app_account",
        )
      ) {
        await service.clearInactiveReviews(tx);
      }
    },
  };
}
