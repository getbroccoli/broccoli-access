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
  const { access, employeesById, employeesByEmail, accountOwners } = employeeLoaders(services);
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
    AccountWithoutPerson: {
      suggestedEmployee: ({ suggestedEmployeeId }, _args, context) =>
        suggestedEmployeeId ? employeesById(context).load(suggestedEmployeeId) : null,
    },
    AppUser: {
      employee: (user, _args, context) => employeesById(context).load(user.employeeId),
    },
    AppInvite: {
      employee: (invite, _args, context) => employeesById(context).load(invite.employeeId),
    },
    AccountChange: {
      employee: (change, _args, context) => {
        // The person a provision was for stays its person, whatever their email is now.
        if (change.employeeId) return employeesById(context).load(change.employeeId);
        return change.appAccountId
          ? accountOwners(context).load(change.appAccountId)
          : employeesByEmail(context).load(change.email);
      },
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
    },
  };
}

function employeeLoaders(services: EmployeeReadService) {
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
  const accountOwners = perRequest(
    (context) =>
      new DataLoader<string, Employee | null>(async (ids) => {
        const owners = await services.readAccountOwners(context.getActor(), ids);
        return ids.map((id) => owners.get(id) ?? null);
      }),
  );
  const employeesByEmail = perRequest(
    (context) =>
      new DataLoader<string, Employee | null>(async (emails) => {
        const found = await services.readEmployeesByEmails(context.getActor(), emails);
        const byEmail = new Map(found.map((employee) => [employee.email, employee]));
        return emails.map((email) => byEmail.get(email) ?? null);
      }),
  );
  return { access, employeesById, employeesByEmail, accountOwners };
}
