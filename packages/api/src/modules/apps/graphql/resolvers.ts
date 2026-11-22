import {
  mutationPayload,
  type Resolvers,
  type ResolversTypes,
  toEnum,
} from "../../../core/graphql";
import type { AppService } from "../app";

export function createResolvers(
  apps: Pick<AppService, "listApps" | "countApps" | "approveApp" | "ignoreApp" | "finishSetup">,
): Resolvers {
  return {
    Query: {
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
    },
  };
}

const STATUSES = { DISCOVERED: "discovered", APPROVED: "approved", IGNORED: "ignored" } as const;
