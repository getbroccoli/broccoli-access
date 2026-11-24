import DataLoader from "dataloader";

import { invalidInput } from "../../../core/applicationError";
import {
  mutationPayload,
  perRequest,
  type Resolvers,
  type ResolversTypes,
  toEnum,
} from "../../../core/graphql";
import type { SecurityContext } from "../../../core/security";
import type {
  AccountChangeService,
  AccountChangeState,
  ConnectionState,
  AppInvite,
  AppService,
  AppSummary,
  AppUser,
  AppUserService,
} from "../app";
import type { AccountChange } from "../domain";

export function createResolvers(
  services: Pick<
    AppService & AppUserService & AccountChangeService,
    | "listApps"
    | "readApp"
    | "readApps"
    | "readUsersOfApps"
    | "readUsersOfEmployees"
    | "countApps"
    | "approveApp"
    | "ignoreApp"
    | "finishSetup"
    | "changeAccount"
    | "readChangeStates"
    | "findAppsWithChangeableAccounts"
    | "readConnectionStates"
    | "listAccountChanges"
    | "readRequesterNames"
    | "markChangeDoneByHand"
    | "inviteEmployee"
    | "readAppInvites"
  >,
): Resolvers {
  const loaders = createLoaders(services);
  return {
    Query: {
      app: (_parent, { id }, context) => services.readApp(context.getActor(), id),
      apps: (_parent, { status, first, after }, context) =>
        services.listApps(context.getActor(), {
          status: STATUSES[status],
          first: first ?? undefined,
          after,
        }),
      appCounts: (_parent, _args, context) => services.countApps(context.getActor()),
      accountChanges: (_parent, { first, after }, context) =>
        services.listAccountChanges(context.getActor(), { first: first ?? undefined, after }),
    },
    Mutation: {
      apps: () => ({}),
    },
    AppsMutations: appsMutations(services, loaders),
    AppUser: {
      status: ({ status }) => toEnum(status),
      app: (user, _args, context) => loaders.appsById(context).load(user.appId),
      isConnectionUser: async ({ id }, _args, context) =>
        (await loaders.changeStates(context).load(id)).isConnectionUser,
      offeredChange: async ({ id }, _args, context) => {
        const { offeredChange } = await loaders.changeStates(context).load(id);
        return offeredChange && toEnum(offeredChange);
      },
      offersReconnect: async ({ id }, _args, context) =>
        (await loaders.changeStates(context).load(id)).offersReconnect,
      latestChange: async ({ id }, _args, context) =>
        (await loaders.changeStates(context).load(id)).latestChange,
    },
    AppInvite: {
      app: (invite, _args, context) => loaders.appsById(context).load(invite.appId),
    },
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
    },
    App: {
      status: ({ status }) => toEnum(status),
      users: async (app, { first }, context) => {
        if (first != null && first < 1) {
          throw invalidInput([{ field: "first", code: "out_of_range" }]);
        }
        return (await loaders.usersOfApps(context).load(app.id)).slice(0, first ?? undefined);
      },
      canChangeAccounts: (app, _args, context) => loaders.changeableApps(context).load(app.id),
    },
    Employee: {
      appAccounts: (employee, _args, context) =>
        loaders.accountsOfEmployees(context).load(employee.id),
      appInvites: (employee, _args, context) =>
        loaders.invitesOfEmployees(context).load(employee.id),
    },
  };
}

/** The module's mutations: approving and ignoring apps, finishing setup, and account changes. */
function appsMutations(
  services: Parameters<typeof createResolvers>[0],
  loaders: ReturnType<typeof createLoaders>,
): Resolvers["AppsMutations"] {
  return {
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
          action: ACTIONS[input.action],
        });
        // The answer shows the change as asked, even when it already ended on the server.
        loaders.changeStates(context).prime(change.appAccountId!, {
          isConnectionUser: false,
          offeredChange: null,
          offersReconnect: false,
          latestChange: change,
        });
        return { appUser: await appUserOf(services, ctx, change) };
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

const STATUSES = { DISCOVERED: "discovered", APPROVED: "approved", IGNORED: "ignored" } as const;

const ACTIONS = { SUSPEND: "suspend", REACTIVATE: "reactivate", INVITE: "invite" } as const;

/** The change's account as its app's users list it; null once it belongs to no employee. */
async function appUserOf(
  services: Parameters<typeof createResolvers>[0],
  ctx: SecurityContext,
  change: AccountChange,
): Promise<AppUser | null> {
  const users = await services.readUsersOfApps(ctx, [change.appId]);
  return users.find(({ id }) => id === change.appAccountId) ?? null;
}

/** The request-scoped batches the fields read through, so a list costs one query per kind. */
function createLoaders(services: Parameters<typeof createResolvers>[0]) {
  return {
    usersOfApps: perRequest(
      (context) =>
        new DataLoader<string, AppUser[]>(async (appIds) => {
          const users = await services.readUsersOfApps(context.getActor(), appIds);
          const byApp = Map.groupBy(users, ({ appId }) => appId);
          return appIds.map((appId) => byApp.get(appId) ?? []);
        }),
    ),
    accountsOfEmployees: perRequest(
      (context) =>
        new DataLoader<string, AppUser[]>(async (employeeIds) => {
          const users = await services.readUsersOfEmployees(context.getActor(), employeeIds);
          const byEmployee = Map.groupBy(users, ({ employeeId }) => employeeId);
          return employeeIds.map((employeeId) => byEmployee.get(employeeId) ?? []);
        }),
    ),
    invitesOfEmployees: perRequest(
      (context) =>
        new DataLoader<string, AppInvite[]>(async (employeeIds) => {
          const invites = await services.readAppInvites(context.getActor(), employeeIds);
          const byEmployee = Map.groupBy(invites, ({ employeeId }) => employeeId);
          return employeeIds.map((employeeId) => byEmployee.get(employeeId) ?? []);
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
    ...createChangeLoaders(services),
  };
}

/** The batches of Disable and Enable: the accounts' states, who asked, and the apps that offer them. */
function createChangeLoaders(services: Parameters<typeof createResolvers>[0]) {
  return {
    changeStates: perRequest(
      (context) =>
        new DataLoader<string, AccountChangeState>(async (accountIds) => {
          const states = await services.readChangeStates(context.getActor(), accountIds);
          return accountIds.map((id) => states.get(id) ?? new Error("No app account has this id."));
        }),
    ),
    requesterNames: perRequest(
      (context) =>
        new DataLoader<string, string>(async (userIds) => {
          const names = await services.readRequesterNames(context.getActor(), userIds);
          return userIds.map((id) => names.get(id) ?? new Error("No user has this id."));
        }),
    ),
    connectionStates: perRequest(
      (context) =>
        new DataLoader<string, ConnectionState>(async (connectionIds) => {
          const states = await services.readConnectionStates(context.getActor(), connectionIds);
          return connectionIds.map(
            (id) => states.get(id) ?? new Error("No app connection has this id."),
          );
        }),
    ),
    changeableApps: perRequest(
      (context) =>
        new DataLoader<string, boolean>(async (appIds) => {
          const changeable = await services.findAppsWithChangeableAccounts(
            context.getActor(),
            appIds,
          );
          return appIds.map((appId) => changeable.has(appId));
        }),
    ),
  };
}
