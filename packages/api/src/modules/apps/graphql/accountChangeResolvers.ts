import type DataLoader from "dataloader";
import { type GraphqlContext, type Resolvers, toEnum } from "../../../core/graphql";
import type { AppSummary, AppUserService } from "../app";
import { accountsById } from "./accountsById";

/** An account change's fields: its app, who asked, each try, and the account it changed. */
export function accountChangeResolvers(
  loaders: {
    appsById: (context: GraphqlContext) => DataLoader<string, AppSummary>;
    requesterNames: (context: GraphqlContext) => DataLoader<string, string>;
  },
  readUsersOfApps: AppUserService["readUsersOfApps"],
): NonNullable<Resolvers["AccountChange"]> {
  const accounts = accountsById(readUsersOfApps);
  return {
    action: ({ action }) => toEnum(action),
    status: ({ status }) => toEnum(status),
    app: (change, _args, context) => loaders.appsById(context).load(change.appId),
    requestedBy: async ({ requestedBy }, _args, context) => ({
      id: requestedBy,
      name: await loaders.requesterNames(context).load(requestedBy),
    }),
    failure: ({ error }) => error && toEnum(error),
    startedFrom: ({ startedFrom }) => toEnum(startedFrom),
    attempts: ({ attempts }) =>
      attempts.map(({ at, runtime, error }) => ({
        at,
        runtime: toEnum(runtime),
        failure: error && toEnum(error),
      })),
    appUser: ({ appAccountId, appId }, _args, context) =>
      appAccountId ? accounts(context).load({ id: appAccountId, appId }) : null,
  };
}
