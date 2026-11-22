import DataLoader from "dataloader";

import { invalidInput } from "../../../core/applicationError";
import {
  mutationPayload,
  perRequest,
  type Resolvers,
  type ResolversTypes,
  toEnum,
} from "../../../core/graphql";
import type { AppService, AppUser, AppUserService } from "../app";

export function createResolvers(
  apps: Pick<
    AppService & AppUserService,
    | "listApps"
    | "readApp"
    | "readUsersOfApps"
    | "countApps"
    | "approveApp"
    | "ignoreApp"
    | "finishSetup"
  >,
): Resolvers {
  const usersOfApps = perRequest(
    (context) =>
      new DataLoader<string, AppUser[]>(async (appIds) => {
        const users = await apps.readUsersOfApps(context.getActor(), appIds);
        const byApp = Map.groupBy(users, ({ appId }) => appId);
        return appIds.map((appId) => byApp.get(appId) ?? []);
      }),
  );
  return {
    Query: {
      app: (_parent, { id }, context) => apps.readApp(context.getActor(), id),
      apps: (_parent, { status, first, after }, context) =>
        apps.listApps(context.getActor(), {
          status: STATUSES[status],
          first: first ?? undefined,
          after,
        }),
      appCounts: (_parent, _args, context) => apps.countApps(context.getActor()),
    },
    Mutation: {
      apps: () => ({}),
    },
    AppsMutations: {
      approve: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["AppApprovePayload"]>(
          async () => ({ app: await apps.approveApp(context.getActor(), input.id) }),
          ["NOT_FOUND"],
        ),
      ignore: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["AppIgnorePayload"]>(
          async () => ({ app: await apps.ignoreApp(context.getActor(), input.id) }),
          ["NOT_FOUND", "CONFLICT"],
        ),
      finishSetup: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["SetupFinishPayload"]>(async () => {
          await apps.finishSetup(context.getActor(), input);
          // Finished setup is the same for everyone: done, and nobody holds it since the owner exists.
          return { setup: { id: "instance", step: "DONE", holder: "NOBODY" } };
        }, ["INVALID_INPUT", "CONFLICT"]),
    },
    App: {
      status: ({ status }) => toEnum(status),
      users: async (app, { first }, context) => {
        if (first != null && first < 1) {
          throw invalidInput([{ field: "first", code: "out_of_range" }]);
        }
        return (await usersOfApps(context).load(app.id)).slice(0, first ?? undefined);
      },
    },
  };
}

const STATUSES = { DISCOVERED: "discovered", APPROVED: "approved", IGNORED: "ignored" } as const;
