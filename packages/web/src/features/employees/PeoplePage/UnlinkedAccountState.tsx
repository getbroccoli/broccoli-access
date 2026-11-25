import { useQuery } from "@apollo/client/react";

import {
  type AccountsWithoutPersonQuery,
  UnlinkedAccountChangeDocument,
} from "@/__generated__/graphql";
import {
  ChangeProgress,
  CouldntChangeDialog,
  showsCouldntChange,
  StatusBadge,
} from "@/features/apps";
import { t } from "@/i18n";

type Props = {
  account: AccountsWithoutPersonQuery["accountsWithoutPerson"]["edges"][number]["node"];
  /** Reads the row again after Try again or I did it by hand. */
  onChanged: () => void;
};

/**
 * What an unlinked account's row shows of Disable and Enable: the change while it runs, "Couldn't
 * disable" opening why and what helps once it failed, and "Disabled" on a suspended account.
 */
export function UnlinkedAccountState({ account, onChanged }: Props) {
  const change = account.latestChange;
  const failed = change != null && showsCouldntChange(account);
  const failure = useQuery(UnlinkedAccountChangeDocument, {
    variables: { id: change?.id ?? "" },
    skip: !failed,
  });
  if (change?.status === "RUNNING") {
    return <ChangeProgress app={account.app.name} change={change} />;
  }
  if (failed && failure.data?.accountChange) {
    return (
      <CouldntChangeDialog
        change={failure.data.accountChange}
        row={{ id: account.id, offeredChange: account.offeredChange ?? null }}
        onChanged={onChanged}
      />
    );
  }
  return account.status === "SUSPENDED" ? (
    <StatusBadge tone="muted">{t("apps.page.inApp.disabled")}</StatusBadge>
  ) : null;
}
