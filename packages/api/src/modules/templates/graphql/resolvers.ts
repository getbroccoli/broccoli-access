import { ApplicationError } from "../../../core/applicationError";
import DataLoader from "dataloader";
import type { GraphQLResolveInfo } from "graphql";
import { z } from "zod";
import { paginate } from "../../../core/pagination";
import type { SecurityContext } from "../../../core/security";
import {
  perRequest,
  mutationPayload,
  type GraphqlContext,
  toEnum,
  type RequestLoader,
  type Resolvers,
  type ResolversTypes,
} from "../../../core/graphql";
import type { TemplateService } from "../app";

/** The employees module reads and sorts the people visible to this caller. */
export type ReadTemplateEmployees = (
  ctx: SecurityContext,
  ids: readonly string[],
) => Promise<Awaited<ResolversTypes["Employee"]>[]>;

export function createResolvers(
  services: TemplateService,
  readEmployees: ReadTemplateEmployees,
  people: RequestLoader<{
    templates: Awaited<ReturnType<TemplateService["readEmployeeTemplates"]>>[number];
    personApps: Awaited<ReturnType<TemplateService["readEmployeeApps"]>>[number];
  }>,
): Resolvers {
  const changedEmployee = async (context: GraphqlContext, employeeId: string) => ({
    employee: (await readEmployees(context.getActor(), [employeeId]))[0] ?? null,
  });
  const differences = differenceResolvers(services, readEmployees);
  const rosters = perRequest(() => ({
    remaining: 10000,
    cache: new Map<string, ReturnType<typeof readRoster>>(),
  }));
  return {
    ...differences,
    Employee: {
      templates: async (employee, { first, after }, ctx) =>
        pageById(
          (await people(ctx).load(employee.id)).templates,
          { first, after },
          (row) => row.id,
          "TEMPLATE_ID",
        ),
      personApps: async (employee, { first, after }, ctx) =>
        pageById(
          (await people(ctx).load(employee.id)).personApps,
          { first, after },
          (row) => row.appId,
          "APP_ID",
        ),
    },
    Template: {
      ...differences.Template,
      async people(template, { first, after }, ctx, info) {
        const pages = rosters(ctx);
        const size = first ?? 100;
        if (insideRoster(info))
          throw new ApplicationError(
            "INVALID_INPUT",
            "Request template members at one level at a time.",
          );
        if (pages.remaining < size)
          throw new ApplicationError("INVALID_INPUT", "Request fewer template members at a time.", [
            { field: "first", code: "out_of_range" },
          ]);
        pages.remaining -= Math.max(1, size);
        const key = JSON.stringify([template.id, size, after ?? null]);
        let page = pages.cache.get(key);
        if (!page) {
          page = readRoster(services, readEmployees, ctx.getActor(), {
            id: template.id,
            first: size,
            after,
          });
          pages.cache.set(key, page);
        }
        return page;
      },
    },
    PersonApp: {
      roleSources: (row) =>
        row.roleConflict
          ? row.templates.map((template) => ({
              template,
              role: template.apps.find(({ appId }) => appId === row.appId)!.role,
            }))
          : [],
      accountStatus: ({ accountStatus }) => accountStatus && toEnum(accountStatus),
      state: ({ state }) => state && toEnum(state),
      choice: ({ choice }) => choice && toEnum(`${choice}_for_person`),
    },
    Query: {
      ...differences.Query,
      template: (_parent, { id }, context) => services.readTemplate(context.getActor(), id),
      templates: (_parent, { first, after, assignableTo }, context) =>
        services.listTemplates(context.getActor(), {
          first: first ?? undefined,
          after,
          assignableTo,
        }),
    },
    Mutation: {
      templates: () => ({}),
    },
    TemplatesMutations: {
      keepExtraApp: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["ExtraAppKeepPayload"]>(
          async () =>
            changedEmployee(context, await services.keepExtraApp(context.getActor(), input)),
          ["CONFLICT", "INVALID_INPUT", "NOT_FOUND"],
        ),
      setAppRole: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TemplateSetAppRolePayload"]>(
          async () => ({
            template: await services.setAppRole(context.getActor(), {
              ...input,
              role: input.role ?? null,
            }),
          }),
          ["INVALID_INPUT", "NOT_FOUND"],
        ),
      pickRole: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TemplatePickRolePayload"]>(
          async () => ({
            role: await services.pickRole(context.getActor(), {
              ...input,
              role: input.role ?? null,
            }),
          }),
          ["CONFLICT", "INVALID_INPUT", "NOT_FOUND"],
        ),
      addPersonApp: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["PersonAppAddPayload"]>(
          async () =>
            changedEmployee(context, await services.addPersonApp(context.getActor(), input)),
          ["CONFLICT", "INVALID_INPUT", "NOT_FOUND"],
        ),
      removePersonApp: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["PersonAppRemovePayload"]>(
          async () =>
            changedEmployee(context, await services.removePersonApp(context.getActor(), input)),
          ["CONFLICT", "INVALID_INPUT", "NOT_FOUND"],
        ),
      undoPersonAppChoice: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["PersonAppUndoChoicePayload"]>(
          async () =>
            changedEmployee(context, await services.undoPersonAppChoice(context.getActor(), input)),
          ["INVALID_INPUT", "NOT_FOUND"],
        ),
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

async function readRoster(
  services: Pick<TemplateService, "readTemplatePeople">,
  readEmployees: ReadTemplateEmployees,
  actor: SecurityContext,
  { id, first, after }: { id: string; first: number; after?: string | null },
) {
  const page = await services.readTemplatePeople(actor, id, { first, after });
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
}

function differenceResolvers(
  services: Pick<TemplateService, "readDifferences">,
  readEmployees: ReadTemplateEmployees,
): Pick<Resolvers, "AccessDifferences" | "AccessDifference" | "Query" | "Template"> {
  const differences = perRequest((ctx) => services.readDifferences(ctx.getActor()));
  const employees = perRequest(
    (ctx) =>
      new DataLoader(async (ids: readonly string[]) => {
        const found = await readEmployees(ctx.getActor(), ids);
        const byId = new Map(found.map((employee) => [employee.id, employee]));
        return ids.map((id) => byId.get(id) ?? new Error("No readable employee has this id."));
      }),
  );
  return {
    AccessDifferences: {
      missingCount: ({ missing }) => missing.length,
      extraCount: ({ extra }) => extra.length,
    },
    AccessDifference: {
      employee: ({ employeeId }, _args, ctx) => employees(ctx).load(employeeId),
    },
    Template: {
      differenceSummary: async ({ id }, _args, ctx) =>
        (await differences(ctx)).templateSummaries.get(id) ?? null,
    },
    Query: {
      accessDifferences: (_parent, _args, ctx) => differences(ctx),
    },
  };
}

/** Page the computed rows only after each app has all its sources. UUID order survives renames. */
function pageById<T>(
  rows: T[],
  args: { first?: number | null; after?: string | null },
  id: (row: T) => string,
  field: string,
) {
  return paginate(
    { first: args.first ?? undefined, after: args.after },
    {
      order: { field, direction: "ASC" },
      keysetValues: { [field]: z.tuple([z.uuid()]) },
      fetch: ({ after, limit }) =>
        rows
          .map((node) => ({ node, values: [id(node)] as [string] }))
          .filter(({ values }) => !after || values[0] > after[0])
          .sort((a, b) => a.values[0].localeCompare(b.values[0]))
          .slice(0, limit),
    },
  );
}

/** Only Template.people returns an EmployeeConnection beneath a Template. Aliases keep the same parent types. */
function insideRoster(info: GraphQLResolveInfo) {
  for (let path = info.path.prev; path; path = path.prev) {
    if (path.typename === "EmployeeConnection" && path.prev?.typename === "Template") return true;
  }
  return false;
}
