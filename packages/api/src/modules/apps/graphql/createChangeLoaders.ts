import DataLoader from "dataloader";
import { perRequest } from "../../../core/graphql";
import type { AccountChangeService, AccountChangeState, ConnectionState } from "../app";

/** The batches of Disable and Enable: the accounts' states, who asked, and the apps that offer them. */
export function createChangeLoaders(
  services: Pick<
    AccountChangeService,
    | "readChangeStates"
    | "readRequesterNames"
    | "readConnectionStates"
    | "findAppsWithChangeableAccounts"
  >,
) {
  return {
    changeStates: perRequest(
      (context) =>
        new DataLoader<string, AccountChangeState>(async (accountIds) => {
          const states = await services.readChangeStates(context.getActor(), accountIds);
          return accountIds.map((id) => states.get(id) ?? EMPTY_STATE);
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

const EMPTY_STATE: AccountChangeState = {
  isConnectionUser: false,
  offeredChange: null,
  offersRemove: false,
  offersReconnect: false,
  latestChange: null,
};
