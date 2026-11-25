import DataLoader from "dataloader";
import { perRequest } from "../../../core/graphql";
import type { AppUser, AppUserService } from "../app";

/** The accounts by id, each read with its app; null for one no longer listed. */
export function accountsById(readUsers: AppUserService["readUsersOfApps"]) {
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
