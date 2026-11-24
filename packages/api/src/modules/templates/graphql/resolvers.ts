import DataLoader from "dataloader";
import type { SecurityContext } from "../../../core/security";
import {
  mutationPayload,
  perRequest,
  toEnum,
  type GraphqlContext,
  type Resolvers,
  type ResolversTypes,
} from "../../../core/graphql";
import type { TemplateService } from "../app";

/** The employees module reads and sorts the people visible to this caller. */
export type ReadTemplateEmployees = (
  ctx: SecurityContext,
  ids: readonly string[],
) => Promise<Awaited<ResolversTypes["Employee"]>[]>;

export type InviteLoader = (ctx: GraphqlContext) => {
  load(id: string): Promise<{ employeeId: string; appId: string; invitedAt: Date | null }[]>;
};
export function createResolvers(
  services: TemplateService,
  readEmployees: ReadTemplateEmployees,
  invites: InviteLoader,
): Resolvers {
  const assigned = perRequest(
    (ctx) =>
      new DataLoader((ids: readonly string[]) =>
        services.readEmployeeTemplates(ctx.getActor(), ids),
      ),
  );
  const apps = perRequest(
    (ctx) =>
      new DataLoader((ids: readonly string[]) =>
        services.readEmployeeApps(ctx.getActor(), ids, {
          templates: Promise.all(ids.map((id) => assigned(ctx).load(id))),
          invites: Promise.all(ids.map((id) => invites(ctx).load(id))).then((groups) =>
            groups.flat(),
          ),
        }),
      ),
  );
  return {
    Employee: {
      templates: (employee, _args, ctx) => assigned(ctx).load(employee.id),
      personApps: (employee, _args, ctx) => apps(ctx).load(employee.id),
    },
    Template: {
      async people(template, { first, after }, ctx) {
        const actor = ctx.getActor();
        const page = await services.readTemplatePeople(actor, template.id, {
          first: first ?? undefined,
          after,
        });
        const people = await readEmployees(
          actor,
          page.edges.map((edge) => edge.node),
        );
        const byId = new Map(people.map((person) => [person.id, person]));
        return {
          ...page,
          edges: page.edges.flatMap((edge) => {
            const node = byId.get(edge.node);
            return node ? [{ ...edge, node }] : [];
          }),
        };
      },
    },
    PersonApp: { state: ({ state }) => state && toEnum(state) },
    Query: {
      template: (_parent, { id }, context) => services.readTemplate(context.getActor(), id),
      templates: (_parent, { first, after }, context) =>
        services.listTemplates(context.getActor(), { first: first ?? undefined, after }),
    },
    Mutation: {
      templates: () => ({}),
    },
    TemplatesMutations: {
      assign: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TemplateAssignPayload"]>(
          async () => ({ template: await services.assign(context.getActor(), input) }),
          ["INVALID_INPUT", "NOT_FOUND"],
        ),
      takeOff: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TemplateTakeOffPayload"]>(
          async () => ({ template: await services.takeOff(context.getActor(), input) }),
          ["NOT_FOUND"],
        ),
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
