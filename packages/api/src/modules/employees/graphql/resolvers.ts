import { mutationPayload, type Resolvers, type ResolversTypes } from "../../../core/graphql";
import type { EmployeeReadService, EmployeeService } from "../app";
import { avatarUrl } from "../http";

export function createResolvers(services: EmployeeService & EmployeeReadService): Resolvers {
  return {
    Query: {
      employee: (_parent, { id }, context) => services.readEmployee(context.getActor(), id),
      employees: (_parent, { first, after, orderBy, filter }, context) =>
        services.listEmployees(context.getActor(), {
          first: first ?? undefined,
          after,
          orderBy,
          filter,
        }),
    },
    Mutation: {
      employees: () => ({}),
    },
    EmployeesMutations: {
      create: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["EmployeeCreatePayload"]>(
          async () => ({ employee: await services.createEmployee(context.getActor(), input) }),
          ["INVALID_INPUT"],
        ),
      update: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["EmployeeUpdatePayload"]>(
          () => services.updateEmployee(context.getActor(), input),
          ["INVALID_INPUT", "NOT_FOUND"],
        ),
      delete: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["EmployeeDeletePayload"]>(
          () => services.deleteEmployee(context.getActor(), input),
          ["INVALID_INPUT", "NOT_FOUND"],
        ),
    },
    User: {
      employee: (_user, _args, context) => services.readMyEmployee(context.getActor()),
    },
    Employee: {
      avatarUrl: ({ avatarFileId }) => avatarFileId && avatarUrl(avatarFileId),
      // shortcut: one query per employee; batch it when a list selects history.
      history: (employee, { first, after }, context) =>
        services.readEmployeeHistory(context.getActor(), employee.id, {
          first: first ?? undefined,
          after,
        }),
    },
  };
}
