import {
  mutationPayload,
  perRequest,
  type RequestLoader,
  type Resolvers,
  type ResolversTypes,
  toEnum,
} from "../../../core/graphql";
import type { SecurityContext } from "../../../core/security";
import type { AppInvite, AppSummary, AppUser, ProvisionService, ProvisionStep } from "../app";

/** The employees module reads the people this caller may see. */
export type ReadEmployees = (
  ctx: SecurityContext,
  ids: readonly string[],
) => Promise<Awaited<ResolversTypes["Employee"]>[]>;

export const provisionStepResolvers: Pick<NonNullable<Resolvers["ProvisionStep"]>, "action"> = {
  action: ({ action }) => toEnum(action),
};

export function provisionMutations(
  services: Pick<ProvisionService, "provisionEmployee">,
  readEmployees: ReadEmployees,
): Pick<NonNullable<Resolvers["AppsMutations"]>, "provisionEmployee"> {
  return {
    provisionEmployee: (_parent, { input }, context) =>
      mutationPayload<ResolversTypes["EmployeeProvisionPayload"]>(async () => {
        const ctx = context.getActor();
        await services.provisionEmployee(ctx, input);
        const [employee] = await readEmployees(ctx, [input.employeeId]);
        return { employee: employee ?? null };
      }, ["NOT_FOUND", "CONFLICT"]),
  };
}

/** Provision and Disable share the same available actions as the person and app pages. */
export function accessDifferenceResolvers(
  people: RequestLoader<{
    appAccounts: AppUser[];
    appInvites: AppInvite[];
    provisionSteps: ProvisionStep[];
  }>,
  {
    appsById,
    usersOfApps,
  }: { appsById: RequestLoader<AppSummary>; usersOfApps: RequestLoader<AppUser[]> },
): Pick<Resolvers, "AccessDifference" | "TemplateDifferenceSummary"> {
  const activeAccountsByApp = perRequest(() => new Map<string, Promise<Map<string, AppUser[]>>>());
  return {
    TemplateDifferenceSummary: {
      missingApp: ({ missingAppId }, _args, ctx) =>
        missingAppId ? appsById(ctx).load(missingAppId) : null,
    },
    AccessDifference: {
      app: ({ appId }, _args, ctx) => appsById(ctx).load(appId),
      async activeAccounts({ employeeId, appId }, _args, context) {
        const byApp = activeAccountsByApp(context);
        let accounts = byApp.get(appId);
        if (!accounts) {
          accounts = usersOfApps(context)
            .load(appId)
            .then((users) =>
              Map.groupBy(
                users.filter(({ status, inApp }) => status === "active" && inApp !== false),
                ({ employeeId }) => employeeId,
              ),
            );
          byApp.set(appId, accounts);
        }
        return (await accounts).get(employeeId) ?? [];
      },
      async provisionStep({ employeeId, appId }, _args, context) {
        const { provisionSteps } = await people(context).load(employeeId);
        return provisionSteps.find((step) => step.appId === appId) ?? null;
      },
      async provisioning({ employeeId, appId }, _args, context) {
        const { appAccounts, appInvites } = await people(context).load(employeeId);
        return (
          appInvites.some((row) => row.appId === appId && row.latestInvite?.status === "running") ||
          appAccounts.some((row) => {
            const change = row.changeState?.latestChange;
            return (
              row.appId === appId && change?.action === "reactivate" && change.status === "running"
            );
          })
        );
      },
    },
  };
}
