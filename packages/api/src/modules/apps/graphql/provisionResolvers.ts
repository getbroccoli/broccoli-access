import DataLoader from "dataloader";
import { type Connector, offersInviteRole } from "../../../core/connectors";
import {
  mutationPayload,
  perRequest,
  type RequestLoader,
  type Resolvers,
  type ResolversTypes,
  toEnum,
} from "../../../core/graphql";
import type { SecurityContext } from "../../../core/security";
import type {
  AppInvite,
  AppSummary,
  AppUser,
  AppUserService,
  LatestAccountChange,
  ProvisionService,
  ProvisionStep,
} from "../app";

/** The employees module reads the people this caller may see. */
export type ReadEmployees = (
  ctx: SecurityContext,
  ids: readonly string[],
) => Promise<Awaited<ResolversTypes["Employee"]>[]>;

export const provisionStepResolvers: Pick<NonNullable<Resolvers["ProvisionStep"]>, "action"> = {
  action: ({ action }) => toEnum(action),
};

export function provisionMutations(
  services: Pick<ProvisionService, "provisionEmployee" | "provisionApp">,
  readEmployees: ReadEmployees,
): Pick<NonNullable<Resolvers["AppsMutations"]>, "provisionEmployee" | "provisionApp"> {
  return {
    provisionApp: (_parent, { input }, context) =>
      mutationPayload<ResolversTypes["AppProvisionPayload"]>(
        () => services.provisionApp(context.getActor(), input),
        ["INVALID_INPUT"],
      ),
    provisionEmployee: (_parent, { input }, context) =>
      mutationPayload<ResolversTypes["EmployeeProvisionPayload"]>(async () => {
        const ctx = context.getActor();
        await services.provisionEmployee(ctx, input);
        const [employee] = await readEmployees(ctx, [input.employeeId]);
        return { employee: employee ?? null };
      }, ["NOT_FOUND", "CONFLICT"]),
  };
}

export type ProvisionRead = {
  personApps: readonly { appId: string; role: string | null; roleConflict: boolean }[];
  appAccounts: AppUser[];
  appInvites: AppInvite[];
  provisionSteps: ProvisionStep[];
};

/** Provision and Disable share the available actions of the person and app pages. */
export function accessDifferenceResolvers(
  people: RequestLoader<ProvisionRead>,
  {
    appsById,
    roles,
  }: {
    appsById: RequestLoader<AppSummary>;
    roles: RequestLoader<NonNullable<Connector["roles"]>>;
  },
  readUsersOfApps: AppUserService["readUsersOfApps"],
): Pick<Resolvers, "AccessDifference" | "TemplateDifferenceSummary"> {
  const accounts = accountsById(readUsersOfApps);
  return {
    TemplateDifferenceSummary: {
      missingApp: ({ missingAppId }, _args, ctx) =>
        missingAppId ? appsById(ctx).load(missingAppId) : null,
    },
    AccessDifference: {
      app: ({ appId }, _args, ctx) => appsById(ctx).load(appId),
      async activeAccounts({ employeeId, appId, accountIds }, _args, ctx) {
        const users = await Promise.all(
          (accountIds ?? []).map((id) => accounts(ctx).load({ id, appId })),
        );
        return users.filter(
          (user): user is AppUser =>
            user?.employeeId === employeeId && user.status === "active" && user.inApp !== false,
        );
      },
      async provisionStep({ employeeId, appId }, _args, ctx) {
        const { provisionSteps } = await people(ctx).load(employeeId);
        return provisionSteps.find((step) => step.appId === appId) ?? null;
      },
      async provisioning({ employeeId, appId }, _args, ctx) {
        return (
          latestProvisionChange(await people(ctx).load(employeeId), appId)?.status === "running"
        );
      },
      async latestProvisionChange({ employeeId, appId }, _args, ctx) {
        return latestProvisionChange(await people(ctx).load(employeeId), appId);
      },
      async roleNeedsAttention({ employeeId, appId }, _args, ctx) {
        const page = await people(ctx).load(employeeId);
        const row = page.personApps.find((app) => app.appId === appId);
        if (!row) return false;
        if (row.roleConflict) return true;
        const step = page.provisionSteps.find((step) => step.appId === appId);
        return (
          step?.action === "invite" &&
          row.role != null &&
          !offersInviteRole(await roles(ctx).load(appId), row.role)
        );
      },
    },
  };
}

function accountsById(readUsers: AppUserService["readUsersOfApps"]) {
  return perRequest(
    (ctx) =>
      new DataLoader<{ id: string; appId: string }, AppUser | null, string>(
        async (keys) => {
          const found = await readUsers(
            ctx.getActor(),
            [...new Set(keys.map(({ appId }) => appId))],
            keys.map(({ id }) => id),
          );
          const users = new Map(found.map((user) => [user.id, user]));
          return keys.map(({ id }) => users.get(id) ?? null);
        },
        { cacheKeyFn: ({ id }) => id },
      ),
  );
}

function latestProvisionChange({ appAccounts, appInvites }: ProvisionRead, appId: string) {
  const changes: LatestAccountChange[] = [];
  const invite = appInvites.find((row) => row.appId === appId)?.latestInvite;
  if (invite) changes.push(invite);
  for (const account of appAccounts) {
    const change = account.changeState?.latestChange;
    if (account.appId === appId && change?.action === "reactivate") changes.push(change);
  }
  return (
    changes.find(({ status }) => status === "running") ??
    changes.sort((first, second) => +second.requestedAt - +first.requestedAt)[0] ??
    null
  );
}
