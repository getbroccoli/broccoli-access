import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";
import { useState } from "react";

import {
  type AccountChangeCell_AppUserFragment,
  AccountChangeCell_AppUserFragmentDoc,
} from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { ReconnectButton } from "../ReconnectButton";
import { ChangeProgress } from "./ChangeProgress";
import { ConfirmAccountChangeDialog } from "./ConfirmAccountChangeDialog";
import { failedChangeOptions, offersFreshRemove, showsCouldntChange } from "./couldntChange";
import { RemoveAccountDialog } from "./RemoveAccountDialog";
import { TryAgainButton } from "./TryAgainButton";
import { changeTargetOf } from "./useChangeAccount";
import { useJustNow } from "./useJustNow";
import { useToastWhenChangeSucceeds } from "./useToastWhenChangeSucceeds";

type Props = {
  /** The app account, whose row selects this cell's fragment. */
  appUser: FragmentType<AccountChangeCell_AppUserFragment>;
  onlyIfExtra?: boolean;
};

/**
 * The row's Disable or Enable, asked in a dialog; then the change's progress, and "Disabled just
 * now" once it succeeds, or Try again once it fails, where trying again can help. "Connected as
 * you" on the connection's own user, "No connection" where the app's connection cannot change
 * accounts, and Reconnect while the connection needs it.
 */
export function AccountChangeCell({ appUser, onlyIfExtra }: Props) {
  const [removing, setRemoving] = useState(false);
  const fragment = useFragment({
    fragment: AccountChangeCell_AppUserFragmentDoc,
    // The document also holds the fragments of the Reconnect button, which this one spreads.
    fragmentName: "AccountChangeCell_appUser",
    from: appUser,
  });
  const user = fragment.complete ? fragment.data : null;
  useToastWhenChangeSucceeds(user);
  const succeeded = user?.latestChange?.status === "SUCCEEDED" ? user.latestChange : null;
  const justNow = useJustNow(succeeded?.finishedAt ?? null);
  if (!user || (onlyIfExtra && user.status !== "ACTIVE")) {
    return null;
  }
  if (!user.app.canChangeAccounts || user.isConnectionUser) {
    return (
      <span className={MUTED}>
        {t(user.isConnectionUser ? "apps.change.connectionUser" : "apps.change.noConnection")}
      </span>
    );
  }
  const connector = user.app.containerConnection?.connector;
  if (user.offersReconnect && connector) {
    return (
      <span className="flex justify-end">
        <ReconnectButton connector={connector} size="sm" variant="outline" />
      </span>
    );
  }
  const change = user.latestChange;
  if (change?.status === "RUNNING") {
    return <ChangeProgress app={user.app.name} change={change} />;
  }
  const failedRemove = change?.action === "REMOVE" && showsCouldntChange(user);
  if (change && !failedRemove && showsCouldntChange(user)) {
    return failedChangeOptions(user).tryAgain ? (
      <span className="flex justify-end">
        <TryAgainButton
          target={changeTargetOf(user, change.action, onlyIfExtra)}
          action={change.action}
        />
      </span>
    ) : null;
  }
  return (
    <span className="flex items-center justify-end gap-3">
      {justNow && succeeded && succeeded.action !== "REMOVE" && (
        <span className={MUTED}>
          {t(
            succeeded.action === "SUSPEND"
              ? "apps.change.disabledJustNow"
              : "apps.change.enabledJustNow",
          )}
        </span>
      )}
      {user.offeredChange && user.offeredChange !== "REMOVE" && (
        <ConfirmAccountChangeDialog
          accountEmail={user.email}
          row={user}
          action={user.offeredChange}
          onlyIfExtra={onlyIfExtra}
        />
      )}
      {failedRemove && failedChangeOptions(user).tryAgain && (
        <TryAgainButton
          target={changeTargetOf(user, change.action)}
          action={change.action}
          retryOf={change.id}
        />
      )}
      {offersFreshRemove(user) && (
        <>
          <Button
            size="sm"
            variant="outline"
            aria-label={t("apps.change.removeName", { name: user.email, app: user.app.name })}
            onClick={() => setRemoving(true)}
          >
            {t("apps.change.remove")}
          </Button>
          <RemoveAccountDialog
            linked
            open={removing}
            onClose={() => setRemoving(false)}
            account={user}
            name={`${user.employee.firstName} ${user.employee.lastName}`}
          />
        </>
      )}
    </span>
  );
}

const MUTED = "block text-right text-sm whitespace-nowrap text-muted-foreground";
