import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";

import {
  type AppAccountStatusCell_AppUserFragment,
  AppAccountStatusCell_AppUserFragmentDoc,
} from "@/__generated__/graphql";

import { CouldntChangeDialog, showsCouldntChange } from "../AccountChangeCell";
import { AppAccountStatusBadge } from "./AppAccountStatusBadge";

type Props = {
  appUser: FragmentType<AppAccountStatusCell_AppUserFragment>;
  onlyIfExtra?: boolean;
};

/**
 * An account's status in its app, or "Couldn't disable" or "Couldn't enable" while its latest change
 * failed and its status is not yet what that change asked for.
 */
export function AppAccountStatusCell({ appUser, onlyIfExtra }: Props) {
  const fragment = useFragment({
    fragment: AppAccountStatusCell_AppUserFragmentDoc,
    fragmentName: "AppAccountStatusCell_appUser",
    from: appUser,
  });
  if (!fragment.complete) {
    return null;
  }
  const user = fragment.data;
  if (user.latestChange && showsCouldntChange(user)) {
    return (
      <CouldntChangeDialog
        change={user.latestChange}
        row={{
          id: user.id,
          offeredChange: user.offeredChange ?? null,
          offersRemove: user.offersRemove,
          onlyIfExtra,
        }}
      />
    );
  }
  return <AppAccountStatusBadge status={user.status} />;
}
