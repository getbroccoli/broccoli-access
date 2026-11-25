import type DataLoader from "dataloader";

import { type GraphqlContext, type Resolvers, toEnum } from "../../../core/graphql";
import type { AccountChangeState } from "../app";

/** What an unlinked account's row shows of Disable and Enable, batched like an app user's. */
export function accountWithoutPersonResolvers(
  changeStates: (context: GraphqlContext) => DataLoader<string, AccountChangeState>,
): Resolvers["AccountWithoutPerson"] {
  return {
    status: ({ status }) => toEnum(status),
    offeredChange: async ({ id }, _args, context) => {
      const { offeredChange } = await changeStates(context).load(id);
      return offeredChange && toEnum(offeredChange);
    },
    latestChange: async ({ id }, _args, context) =>
      (await changeStates(context).load(id)).latestChange,
  };
}
