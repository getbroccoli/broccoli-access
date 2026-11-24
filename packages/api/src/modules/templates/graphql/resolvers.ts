import { mutationPayload, type Resolvers, type ResolversTypes } from "../../../core/graphql";
import type { TemplateService } from "../app";

export function createResolvers(services: TemplateService): Resolvers {
  return {
    Query: {
      template: (_parent, { id }, context) => services.readTemplate(context.getActor(), id),
      templates: (_parent, { first, after }, context) =>
        services.listTemplates(context.getActor(), { first: first ?? undefined, after }),
    },
    Mutation: {
      templates: () => ({}),
    },
    TemplatesMutations: {
      create: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TemplateCreatePayload"]>(
          async () => ({ template: await services.createTemplate(context.getActor(), input) }),
          ["INVALID_INPUT"],
        ),
      update: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TemplateUpdatePayload"]>(
          async () => ({ template: await services.updateTemplate(context.getActor(), input) }),
          ["INVALID_INPUT", "NOT_FOUND"],
        ),
      delete: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TemplateDeletePayload"]>(async () => {
          await services.deleteTemplate(context.getActor(), input.id);
          return {};
        }, ["NOT_FOUND"]),
      addApp: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TemplateAddAppPayload"]>(
          async () => ({ template: await services.addApp(context.getActor(), input) }),
          ["INVALID_INPUT", "NOT_FOUND"],
        ),
      takeOutApp: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TemplateTakeOutAppPayload"]>(
          async () => ({ template: await services.takeOutApp(context.getActor(), input) }),
          ["NOT_FOUND"],
        ),
    },
  };
}
