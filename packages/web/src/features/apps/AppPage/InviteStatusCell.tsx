import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";

import {
  type InviteStatusCell_AppInviteFragment,
  InviteStatusCell_AppInviteFragmentDoc,
} from "@/__generated__/graphql";
import { t } from "@/i18n";

import { CouldntChangeDialog } from "../AccountChangeCell";
import { StatusBadge } from "./StatusBadge";

type Props = {
  appInvite: FragmentType<InviteStatusCell_AppInviteFragment>;
};

/** "No account" in an app the person may be invited to, or "Couldn't invite" while their latest invite failed. */
export function InviteStatusCell({ appInvite }: Props) {
  const fragment = useFragment({
    fragment: InviteStatusCell_AppInviteFragmentDoc,
    fragmentName: "InviteStatusCell_appInvite",
    from: appInvite,
  });
  if (!fragment.complete) {
    return null;
  }
  const invite = fragment.data;
  if (invite.latestInvite?.status === "FAILED") {
    return (
      <CouldntChangeDialog
        change={invite.latestInvite}
        row={{ id: invite.id, offeredChange: invite.offered ? "INVITE" : null }}
      />
    );
  }
  return <StatusBadge tone="muted">{t("apps.change.noAccount")}</StatusBadge>;
}
