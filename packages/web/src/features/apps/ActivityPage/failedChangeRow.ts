import type { AccountChangeAction, ActivityFailedChangeQuery } from "@/__generated__/graphql";

import { showsCouldntChange } from "../AccountChangeCell";
import { isRoleBlocked } from "../isRoleBlocked";

type FailedChange = Pick<
  NonNullable<ActivityFailedChangeQuery["accountChange"]>,
  "id" | "action" | "app" | "appUser" | "employee"
>;

/**
 * The row Try again and I did it by hand act on, while this change is its latest and the row still
 * shows it failed, as on the row itself: the account it changed, or the person's invite row.
 */
export function failedChangeRow({ id, action, app, appUser, employee }: FailedChange) {
  if (action !== "INVITE") {
    if (appUser?.latestChange?.id !== id) return undefined;
    const latestChange = { status: "FAILED" as const, action };
    if (!showsCouldntChange({ ...appUser, latestChange })) return undefined;
    return {
      id: appUser.id,
      offeredChange: appUser.offeredChange ?? null,
      offersRemove: appUser.offersRemove,
    };
  }
  const invite = employee?.appInvites.find((row) => row.app.id === app.id);
  if (!invite || invite.latestInvite?.id !== id || invite.invitedAt) return undefined;
  const personApp = employee?.personApps.edges.find(({ node }) => node.app.id === app.id)?.node;
  const roleConflict = personApp ? isRoleBlocked(personApp) : false;
  const offeredChange: AccountChangeAction | null =
    invite.offered && !roleConflict ? "INVITE" : null;
  return { id: invite.id, roleConflict, offeredChange };
}
