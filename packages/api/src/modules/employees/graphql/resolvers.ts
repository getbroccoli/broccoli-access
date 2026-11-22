import DataLoader from "dataloader";

import {
  mutationPayload,
  perRequest,
  type Resolvers,
  type ResolversTypes,
  toEnum,
} from "../../../core/graphql";
import type { EmployeeReadService, EmployeeService } from "../app";
import type { Employee, EmployeeAccess } from "../domain";
import { avatarUrl } from "../http";

export function createResolvers(services: EmployeeService & EmployeeReadService): Resolvers {
  const access = perRequest(
    (context) =>
      new DataLoader<string, EmployeeAccess>((employeeIds) =>
        services.readAccessOfEmployees(context.getActor(), employeeIds),
      ),
  );
  const employeesById = perRequest(
    (context) =>
      new DataLoader<string, Employee>(async (ids) => {
        const found = await services.readEmployees(context.getActor(), ids);
        const byId = new Map(found.map((employee) => [employee.id, employee]));
        return ids.map(
          (id) => byId.get(id) ?? new Error("No employee the caller may read has this id."),
        );
      }),
  );
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
      employeeCounts: (_parent, _args, context) => services.countEmployees(context.getActor()),
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
    },
    AppUser: {
      employee: (user, _args, context) => employeesById(context).load(user.employeeId),
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
      status: async ({ id }, _args, context) => {
        const { status } = await access(context).load(id);
        return status && toEnum(status);
      },
      approvedAppNames: async ({ id }, _args, context) =>
        (await access(context).load(id)).currentAccess.map(({ appName }) => appName),
      suspendedWithAccess: async ({ id }, _args, context) =>
        (await access(context).load(id)).suspendedWithAccess,
      currentAccess: async ({ id }, _args, context) =>
        (await access(context).load(id)).currentAccess,
    },
  };
}
