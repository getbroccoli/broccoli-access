import type { HistoryAppend } from "../../core/records";
import { readSdl } from "../../core/graphql";
import type { ModuleManifest } from "../../core/moduleManifest";
import { createTemplateService } from "./app";
import { createResolvers, type ReadTemplateEmployees } from "./graphql";

export { readInviteRole, createTemplateService, type TemplateService } from "./app";

/** Templates, their people, and the apps they give them. */
export function templatesModule(
  service: ReturnType<typeof createTemplateService>,
  readEmployees: ReadTemplateEmployees,
  people: Parameters<typeof createResolvers>[2],
): ModuleManifest {
  return {
    name: "templates",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(service, readEmployees, people),
    async eventsBeforeCommit(tx, events) {
      const appIds = new Set<string>();
      let provenance: Pick<HistoryAppend, "cause" | "requestedBy"> | undefined;
      for (const event of events) {
        if (event.type === "imports.appScanned") {
          appIds.add(event.payload.appId);
          provenance = { cause: { kind: "FOUND_BY_SCAN", ref: event.payload.sourceId } };
        }
        if (event.type === "apps.accountsChanged") {
          const { cause, requestedBy } = event.payload;
          provenance = { cause, requestedBy };
          for (const id of event.payload.appIds) appIds.add(id);
        }
      }
      if (provenance) await service.clearInactiveReviews(tx, [...appIds], provenance);
    },
  };
}
