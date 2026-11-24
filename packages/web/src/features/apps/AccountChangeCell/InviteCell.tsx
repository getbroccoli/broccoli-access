import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";

import {
  type InviteCell_AppInviteFragment,
  InviteCell_AppInviteFragmentDoc,
} from "@/__generated__/graphql";
import { t } from "@/i18n";
import { formatSince } from "@/lib/since";

import { ReconnectButton } from "../ReconnectButton";
import { ChangeProgress } from "./ChangeProgress";
import { ConfirmAccountChangeDialog } from "./ConfirmAccountChangeDialog";
import { failedChangeOptions } from "./couldntChange";
import { TryAgainButton } from "./TryAgainButton";
import { changeTargetOf } from "./useChangeAccount";

type Props = {
  /** Prevents starting another invite while the template role needs attention. */
  roleBlocked?: boolean;
  /** The person's invite row, whose row selects this cell's fragment. */
  appInvite: FragmentType<InviteCell_AppInviteFragment>;
};

/**
 * An app the person has no account in: Invite, asked in a dialog; then the invite's progress, and
 * "Invited on <day>" while they are Invited, by this invite or an invitation sent in the app
 * itself, or Try again once it failed, where trying again can help. Reconnect while the app's
 * connection needs it.
 */
export function InviteCell({ appInvite, roleBlocked }: Props) {
  const fragment = useFragment({
    fragment: InviteCell_AppInviteFragmentDoc,
    // The document also holds the fragments of the Reconnect button, which this one spreads.
    fragmentName: "InviteCell_appInvite",
    from: appInvite,
  });
  if (!fragment.complete) {
    return null;
  }
  const invite = fragment.data;
  const { app, latestInvite: latest } = invite;
  const connector = app.containerConnection?.connector;
  if (invite.offersReconnect && connector) {
    return (
      <span className="flex justify-end">
        <ReconnectButton connector={connector} size="sm" variant="outline" />
      </span>
    );
  }
  if (latest?.status === "RUNNING") {
    return <ChangeProgress app={app.name} change={latest} />;
  }
  if (invite.invitedAt) {
    const day = formatSince({ at: invite.invitedAt, before: false });
    return (
      <span className="block text-right text-sm whitespace-nowrap text-muted-foreground">
        {t("apps.change.invitedOn", { day })}
      </span>
    );
  }
  const offeredChange = invite.offered && !roleBlocked ? "INVITE" : null;
  if (latest?.status === "FAILED") {
    return failedChangeOptions({ offeredChange, latestChange: latest, app }).tryAgain ? (
      <span className="flex justify-end">
        <TryAgainButton target={changeTargetOf(invite, "INVITE")} action="INVITE" />
      </span>
    ) : null;
  }
  return (
    offeredChange && (
      <span className="flex justify-end">
        <ConfirmAccountChangeDialog row={invite} action={offeredChange} />
      </span>
    )
  );
}
