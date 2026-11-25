import { accountLinkMutations } from "./accountLinkMutations";
import { accountWithoutPersonResolvers } from "./accountWithoutPersonResolvers";
import { createChangeLoaders } from "./createChangeLoaders";
import DataLoader from "dataloader";

import { invalidInput } from "../../../core/applicationError";
import {
  mutationPayload,
  perRequest,
  type Resolvers,
  type RequestLoader,
  type ResolversTypes,
  type GraphqlContext,
  toEnum,
} from "../../../core/graphql";
import type { SecurityContext } from "../../../core/security";
import type {
  AccountWithoutPerson,
  AccountLinkService,
  AccountChangeService,
  AppInvite,
  AppService,
  AppSummary,
  AppUser,
  AppUserService,
  ProvisionService,
  ProvisionStep,
} from "../app";
import type { AccountChange } from "../domain";
import {
  offboardingMutations,
  offboardingResolvers,
  type OffboardingServices,
  type ReadEmployees,
} from "./offboardingResolvers";
import { provisionMutations, provisionStepResolvers } from "./provisionResolvers";

type AppResolverServices = AccountLinkService &
  Pick<
    AppService & AppUserService & AccountChangeService & ProvisionService,
    | "listApps"
    | "readApp"
    | "readApps"
    | "readAppRoles"
    | "readUsersOfApps"
    | "countApps"
    | "approveApp"
    | "ignoreApp"
    | "finishSetup"
    | "changeAccount"
    | "readChangeStates"
    | "findAppsWithChangeableAccounts"
    | "readConnectionStates"
    | "listAccountChanges"
    | "readAccountChange"
    | "readRequesterNames"
    | "markChangeDoneByHand"
    | "inviteEmployee"
    | "provisionEmployee"
  >;

export function createResolvers(
  services: AppResolverServices & OffboardingServices,
  people: RequestLoader<{
    appAccounts: AppUser[];
    appInvites: AppInvite[];
    provisionSteps: ProvisionStep[];
  }>,
  readEmployees: ReadEmployees,
): Resolvers {
  const loaders = createLoaders(services);
  const appOf = ({ appId }: { appId: string }, _args: unknown, ctx: GraphqlContext) =>
    loaders.appsById(ctx).load(appId);
  const offboarding = offboardingResolvers(services, loaders.appsById);
  const summary = (app: AccountWithoutPerson["app"] | AppSummary, context: GraphqlContext) =>
    "peopleCount" in app ? app : loaders.appsById(context).load(app.id);
  return {
    Query: {
      accountsWithoutPerson: (_parent, { first, after }, context) =>
        services.listAccountsWithoutPerson(context.getActor(), {
          first: first ?? undefined,
          after,
        }),
      markedAccounts: (_parent, { first, after }, context) =>
        services.listMarkedAccounts(context.getActor(), { first: first ?? undefined, after }),
      accountsWithoutPersonCount: (_parent, _args, context) =>
        services.countAccountsWithoutPerson(context.getActor()),
      app: (_parent, { id }, context) => services.readApp(context.getActor(), id),
      apps: (_parent, { status, first, after }, context) =>
        services.listApps(context.getActor(), {
          status: fromEnum(status),
          first: first ?? undefined,
          after,
        }),
      appCounts: (_parent, _args, context) => services.countApps(context.getActor()),
      accountChange: (_parent, { id }, context) =>
        services.readAccountChange(context.getActor(), id),
      accountChanges: (_parent, { first, after }, context) =>
        services.listAccountChanges(context.getActor(), { first: first ?? undefined, after }),
    },
    Mutation: {
      apps: () => ({}),
    },
    AppsMutations: {
      ...appsMutations(services),
      ...offboardingMutations(services, readEmployees),
      ...provisionMutations(services, readEmployees),
    },
    OffboardingByHandWork: offboarding.OffboardingByHandWork,
    AccountWithoutPerson: accountWithoutPersonResolvers(loaders.changeStates),
    MarkedAccount: {
      kind: ({ kind }) => toEnum(kind),
    },
    AppUser: {
      status: ({ status }) => toEnum(status),
      app: (user, _args, context) => loaders.appsById(context).load(user.appId),
      isConnectionUser: async (user, _args, context) =>
        (await loaders.actions(user, context)).isConnectionUser,
      offeredChange: async (user, _args, context) => {
        const { offeredChange } = await loaders.actions(user, context);
        return offeredChange && toEnum(offeredChange);
      },
      offersRemove: async (user, _args, context) =>
        (await loaders.actions(user, context)).offersRemove,
      offersReconnect: async (user, _args, context) =>
        (await loaders.actions(user, context)).offersReconnect,
      latestChange: async (user, _args, context) =>
        (await loaders.actions(user, context)).latestChange,
    },
    AppInvite: { app: appOf },
    ProvisionStep: { app: appOf, ...provisionStepResolvers },
    PersonApp: { app: appOf },
    TemplateApp: { app: appOf },
    ContainerConnection: {
      app: async ({ id }, _args, context) =>
        loaders.appsById(context).load((await loaders.connectionStates(context).load(id)).appId),
      status: async ({ id }, _args, context) =>
        toEnum((await loaders.connectionStates(context).load(id)).status),
      reconnectReason: async ({ id }, _args, context) => {
        const reason = (await loaders.connectionStates(context).load(id)).reconnectReason;
        return (
          reason && {
            cause: toEnum(reason.cause),
            foundAt: reason.foundAt,
            // A change that found a Reconnect has failed, so it waits in no queue.
            foundByChange: reason.foundByChange && { ...reason.foundByChange, changesAhead: null },
          }
        );
      },
    },
    AccountChange: {
      action: ({ action }) => toEnum(action),
      status: ({ status }) => toEnum(status),
      app: (change, _args, context) => loaders.appsById(context).load(change.appId),
      requestedBy: async ({ requestedBy }, _args, context) => ({
        id: requestedBy,
        name: await loaders.requesterNames(context).load(requestedBy),
      }),
      failure: ({ error }) => error && toEnum(error),
      startedFrom: ({ startedFrom }) => toEnum(startedFrom),
    },
    App: {
      roles: (app, _args, context) => loaders.roles(context).load(app.id),
      peopleCount: async (app, _args, context) => (await summary(app, context)).peopleCount,
      foundVia: async (app, _args, context) => (await summary(app, context)).foundVia,
      since: async (app, _args, context) => (await summary(app, context)).since,
      preselected: async (app, _args, context) => (await summary(app, context)).preselected,
      suspendedWithAccessCount: async (app, _args, context) =>
        (await summary(app, context)).suspendedWithAccessCount,
      connected: async (app, _args, context) => (await summary(app, context)).connected,
      status: ({ status }) => toEnum(status),
      peoplePreview: async (app, { first }, context) => {
        if (first < 1) throw invalidInput([{ field: "first", code: "out_of_range" }]);
        const accounts = await loaders.usersOfApps(context).load(app.id);
        const people = Map.groupBy(
          accounts.filter(({ inApp }) => inApp !== false),
          ({ employeeId }) => employeeId,
        );
        return [...people.values()].slice(0, first).map((owned) => owned[0]!);
      },
      users: async (app, { first }, context) => {
        if (first != null && first < 1) {
          throw invalidInput([{ field: "first", code: "out_of_range" }]);
        }
        return (await loaders.usersOfApps(context).load(app.id)).slice(0, first ?? undefined);
      },
      canChangeAccounts: (app, _args, context) => loaders.changeableApps(context).load(app.id),
    },
    Employee: {
      appAccounts: async (employee, _args, context) =>
        (await people(context).load(employee.id)).appAccounts,
      appInvites: async (employee, _args, context) =>
        (await people(context).load(employee.id)).appInvites,
      ...offboarding.Employee,
      provisionSteps: async (employee, _args, context) =>
        (await people(context).load(employee.id)).provisionSteps,
    },
  };
}

/** The module's mutations: approving and ignoring apps, finishing setup, and account changes. */
function appsMutations(services: AppResolverServices): Resolvers["AppsMutations"] {
  return {
    ...accountLinkMutations(services),
    approve: (_parent, { input }, context) =>
      mutationPayload<ResolversTypes["AppApprovePayload"]>(
        async () => ({ app: await services.approveApp(context.getActor(), input.id) }),
        ["NOT_FOUND"],
      ),
    ignore: (_parent, { input }, context) =>
      mutationPayload<ResolversTypes["AppIgnorePayload"]>(
        async () => ({ app: await services.ignoreApp(context.getActor(), input.id) }),
        ["NOT_FOUND", "CONFLICT"],
      ),
    finishSetup: (_parent, { input }, context) =>
      mutationPayload<ResolversTypes["SetupFinishPayload"]>(async () => {
        await services.finishSetup(context.getActor(), input);
        // Finished setup is the same for everyone: done, and nobody holds it since the owner exists.
        return { setup: { id: "instance", step: "DONE", holder: "NOBODY" } };
      }, ["INVALID_INPUT", "CONFLICT"]),
    changeAccount: (_parent, { input }, context) =>
      mutationPayload<ResolversTypes["AppUserChangePayload"]>(async () => {
        const ctx = context.getActor();
        const change = await services.changeAccount(ctx, {
          appAccountId: input.id,
          retryOf: input.retryOf,
          action: fromEnum(input.action),
        });
        // The answer shows the change as asked, even when it already ended on the server.
        const user = await appUserOf(services, ctx, change);
        const changeState = {
          isConnectionUser: false,
          offeredChange: null,
          offersRemove: false,
          offersReconnect: false,
          latestChange: change,
        };
        return { appUser: user && { ...user, changeState } };
      }, ["NOT_FOUND", "CONFLICT"]),
    markAccountChangeDoneByHand: (_parent, { input }, context) =>
      mutationPayload<ResolversTypes["AccountChangeMarkDoneByHandPayload"]>(async () => {
        const ctx = context.getActor();
        const change = await services.markChangeDoneByHand(ctx, input.id);
        return { appUser: await appUserOf(services, ctx, change), accountChange: change };
      }, ["NOT_FOUND", "CONFLICT"]),
    inviteEmployee: (_parent, { input }, context) =>
      mutationPayload<ResolversTypes["AppInvitePayload"]>(
        async () => ({ appInvite: await services.inviteEmployee(context.getActor(), input) }),
        ["NOT_FOUND", "CONFLICT"],
      ),
  };
}

function fromEnum<T extends string>(value: T): Lowercase<T> {
  return value.toLowerCase() as Lowercase<T>;
}

async function appUserOf(
  services: AppResolverServices,
  ctx: SecurityContext,
  change: AccountChange,
): Promise<AppUser | null> {
  if (!change.appAccountId) {
    return null;
  }
  const users = await services.readUsersOfApps(ctx, [change.appId], [change.appAccountId]);
  return users.find(({ id }) => id === change.appAccountId) ?? null;
}

/** The request-scoped batches the fields read through, so a list costs one query per kind. */
function createLoaders(services: AppResolverServices) {
  const changes = createChangeLoaders(services);
  return {
    usersOfApps: perRequest(
      (context) =>
        new DataLoader<string, AppUser[]>(async (appIds) => {
          const users = await services.readUsersOfApps(context.getActor(), appIds);
          const byApp = Map.groupBy(users, ({ appId }) => appId);
          return appIds.map((appId) => byApp.get(appId) ?? []);
        }),
    ),
    roles: perRequest(
      (context) =>
        new DataLoader(async (ids: readonly string[]) => {
          const roles = await services.readAppRoles(context.getActor(), ids);
          return ids.map((id) => roles.get(id) ?? []);
        }),
    ),
    appsById: perRequest(
      (context) =>
        new DataLoader<string, AppSummary>(async (appIds) => {
          const apps = await services.readApps(context.getActor(), appIds);
          return appIds.map(
            (appId) => apps.find(({ id }) => id === appId) ?? new Error("No app has this id."),
          );
        }),
    ),
    ...changes,
    actions: (user: AppUser, ctx: Parameters<typeof changes.changeStates>[0]) =>
      user.changeState ?? changes.changeStates(ctx).load(user.id),
  };
}
