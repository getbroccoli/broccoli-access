import DataLoader from "dataloader";

import { invalidInput } from "../../../core/applicationError";
import {
  mutationPayload,
  perRequest,
  type Resolvers,
  type ResolversTypes,
  toEnum,
} from "../../../core/graphql";
import type {
  AccountChangeService,
  AccountChangeState,
  AppService,
  AppSummary,
  AppUser,
  AppUserService,
} from "../app";

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
    },
    Mutation: {
      apps: () => ({}),
    },
    AppsMutations: {
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
            latestChange: change,
          });
          const users = await services.readUsersOfApps(ctx, [change.appId]);
          return { appUser: users.find(({ id }) => id === change.appAccountId) ?? null };
        }, ["NOT_FOUND", "CONFLICT"]),
    },
    AppUser: {
      status: ({ status }) => toEnum(status),
      app: (user, _args, context) => loaders.appsById(context).load(user.appId),
      isConnectionUser: async ({ id }, _args, context) =>
        (await loaders.changeStates(context).load(id)).isConnectionUser,
      offeredChange: async ({ id }, _args, context) => {
        const { offeredChange } = await loaders.changeStates(context).load(id);
        return offeredChange && toEnum(offeredChange);
      },
      latestChange: async ({ id }, _args, context) =>
        (await loaders.changeStates(context).load(id)).latestChange,
    },
    AccountChange: {
      action: ({ action }) => toEnum(action),
      status: ({ status }) => toEnum(status),
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
    },
  };
}

const STATUSES = { DISCOVERED: "discovered", APPROVED: "approved", IGNORED: "ignored" } as const;

const ACTIONS = { SUSPEND: "suspend", REACTIVATE: "reactivate" } as const;

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
    appsById: perRequest(
      (context) =>
        new DataLoader<string, AppSummary>(async (appIds) => {
          const apps = await services.readApps(context.getActor(), appIds);
          return appIds.map(
            (appId) => apps.find(({ id }) => id === appId) ?? new Error("No app has this id."),
          );
        }),
    ),
    changeStates: perRequest(
      (context) =>
        new DataLoader<string, AccountChangeState>(async (accountIds) => {
          const states = await services.readChangeStates(context.getActor(), accountIds);
          return accountIds.map((id) => states.get(id) ?? new Error("No app account has this id."));
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
