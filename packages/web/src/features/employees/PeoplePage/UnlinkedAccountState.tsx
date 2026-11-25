import { useLazyQuery } from "@apollo/client/react";
import { WarningCircle } from "@phosphor-icons/react";
import { toast } from "sonner";

import {
  type AccountsWithoutPersonQuery,
  UnlinkedAccountChangeDocument,
} from "@/__generated__/graphql";
import {
  ChangeProgress,
  CouldntChangeDialog,
  couldntChangeChipClassName,
  couldntChangeCopy,
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
 * What an unlinked account's row shows of Disable, Enable and Remove: the change while it runs, "Couldn't
 * disable" opening why and what helps once it failed, and "Disabled" on a suspended account.
 */
export function UnlinkedAccountState({ account, onChanged }: Props) {
  const change = account.latestChange;
  const [loadFailure, failure] = useLazyQuery(UnlinkedAccountChangeDocument);
  async function openFailure(id: string) {
    try {
      const { data } = await loadFailure({ variables: { id } });
      if (data?.accountChange) return;
    } catch {
      // The failure chip stays available so the owner can try again.
    }
    toast.error(t("apps.couldnt.loadFailed"));
  }
  if (change?.status === "RUNNING") {
    return <ChangeProgress app={account.app.name} change={change} />;
  }
  if (change && showsCouldntChange(account)) {
    const details = failure.data?.accountChange;
    const copy = couldntChangeCopy[change.action];
    if (details?.id !== change.id) {
      return (
        <button
          type="button"
          className={couldntChangeChipClassName}
          disabled={failure.loading}
          aria-label={t(copy.title, {
            name: account.displayName ?? account.email,
            app: account.app.name,
          })}
          onClick={() => void openFailure(change.id)}
        >
          <WarningCircle size={13} weight="bold" aria-hidden />
          {t(copy.chip)}
        </button>
      );
    }
    return (
      <CouldntChangeDialog
        key={change.id}
        initiallyOpen
        change={details}
        row={{
          id: account.id,
          name: account.displayName,
          offeredChange: account.offeredChange ?? null,
          offersRemove: account.offersRemove,
        }}
        onChanged={onChanged}
      />
    );
  }
  return account.status === "SUSPENDED" ? (
    <StatusBadge tone="muted">{t("apps.page.inApp.disabled")}</StatusBadge>
  ) : null;
}
