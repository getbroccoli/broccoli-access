import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";

import {
  type AccountChangeCell_AppUserFragment,
  AccountChangeCell_AppUserFragmentDoc,
} from "@/__generated__/graphql";
import { t } from "@/i18n";

import { ChangeProgress } from "./ChangeProgress";
import { ConfirmAccountChangeDialog } from "./ConfirmAccountChangeDialog";
import { useJustNow } from "./useJustNow";
import { useToastWhenChangeSucceeds } from "./useToastWhenChangeSucceeds";

type Props = {
  /** The app account, whose row selects this cell's fragment. */
  appUser: FragmentType<AccountChangeCell_AppUserFragment>;
};

/**
 * The row's Disable or Enable, asked in a dialog; then the change's progress, and "Disabled just
 * now" once it succeeds. "Connected as you" on the connection's own user, "No connection" where
 * the app's connection cannot change accounts.
 */
export function AccountChangeCell({ appUser }: Props) {
  const fragment = useFragment({ fragment: AccountChangeCell_AppUserFragmentDoc, from: appUser });
  const user = fragment.complete ? fragment.data : null;
  useToastWhenChangeSucceeds(user);
  const succeeded = user?.latestChange?.status === "SUCCEEDED" ? user.latestChange : null;
  const justNow = useJustNow(succeeded?.finishedAt ?? null);
  if (!user) {
    return null;
  }
  if (!user.app.canChangeAccounts || user.isConnectionUser) {
    return (
      <span className={MUTED}>
        {t(user.isConnectionUser ? "apps.change.connectionUser" : "apps.change.noConnection")}
      </span>
    );
  }
  const change = user.latestChange;
  if (change?.status === "RUNNING") {
    return <ChangeProgress app={user.app.name} change={change} />;
  }
  return (
    <span className="flex items-center justify-end gap-3">
      {justNow && succeeded && (
        <span className={MUTED}>
          {t(
            succeeded.action === "SUSPEND"
              ? "apps.change.disabledJustNow"
              : "apps.change.enabledJustNow",
          )}
        </span>
      )}
      {user.offeredChange && <ConfirmAccountChangeDialog user={user} action={user.offeredChange} />}
    </span>
  );
}

const MUTED = "block text-right text-sm whitespace-nowrap text-muted-foreground";
