import DataLoader from "dataloader";

import {
  type GraphqlContext,
  mutationPayload,
  perRequest,
  type Resolvers,
  type ResolversTypes,
  toEnum,
} from "../../../core/graphql";
import type { SecurityContext } from "../../../core/security";
import type { AccountChangeService, AppSummary, EmployeeOffboarding } from "../app";

export type OffboardingServices = Pick<
  AccountChangeService,
  "offboardEmployee" | "removeEmployeeAccounts" | "readOffboardings"
>;

/** The employees module reads the people this caller may see. */
export type ReadEmployees = (
  ctx: SecurityContext,
  ids: readonly string[],
) => Promise<Awaited<ResolversTypes["Employee"]>[]>;

/** A person's offboarding and directory account, read once per request for all of them. */
export function offboardingResolvers(
  services: OffboardingServices,
  appsById: (context: GraphqlContext) => DataLoader<string, AppSummary>,
): Pick<Resolvers, "Employee" | "OffboardingByHandWork"> {
  const offboardings = perRequest(
    (context) =>
      new DataLoader<string, EmployeeOffboarding>((employeeIds) =>
        services.readOffboardings(context.getActor(), employeeIds),
      ),
  );
  return {
    Employee: {
      directoryAccount: async (employee, _args, context) =>
        (await offboardings(context).load(employee.id)).directoryAccount,
      offboarding: (employee, _args, context) => offboardings(context).load(employee.id),
    },
    OffboardingByHandWork: {
      app: (work, _args, context) => appsById(context).load(work.appId),
      reason: ({ reason }) => toEnum(reason),
    },
  };
}

export function offboardingMutations(
  services: OffboardingServices,
  readEmployees: ReadEmployees,
): Pick<NonNullable<Resolvers["AppsMutations"]>, "offboardEmployee" | "removeEmployeeAccounts"> {
  return {
    offboardEmployee: (_parent, { input }, context) =>
      mutationPayload<ResolversTypes["EmployeeOffboardPayload"]>(async () => {
        const ctx = context.getActor();
        await services.offboardEmployee(ctx, input);
        const [employee] = await readEmployees(ctx, [input.employeeId]);
        return { employee: employee ?? null };
      }, ["NOT_FOUND"]),
    removeEmployeeAccounts: (_parent, { input }, context) =>
      mutationPayload<ResolversTypes["EmployeeRemoveAccountsPayload"]>(async () => {
        const ctx = context.getActor();
        await services.removeEmployeeAccounts(ctx, input);
        const [employee] = await readEmployees(ctx, [input.employeeId]);
        return { employee: employee ?? null };
      }, ["NOT_FOUND"]),
  };
}
