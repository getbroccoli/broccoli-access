import { useLazyQuery } from "@apollo/client/react";
import { WarningCircle } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";

import { ActivityFailedChangeDocument } from "@/__generated__/graphql";
import { useCache } from "@/apollo";
import { t } from "@/i18n";

import { CouldntChangeDialog, couldntChangeCopy } from "../AccountChangeCell";
import { forgetAccessCounts, forgetAccountChanges } from "../cache";
import type { AccountChangeRow } from "./accountChangeRow";
import { failedChangeRow } from "./failedChangeRow";

type Props = {
  change: Pick<AccountChangeRow, "id" | "action" | "email" | "app" | "employee">;
  /** The chip's look. */
  triggerClassName: string;
};

/**
 * "Couldn't disable" and the like on Activity: each opening reads the change and the row it may act
 * on afresh, so the dialog shows its tries and, while the row still shows it failed, what helps.
 */
export function ActivityCouldntChange({ change, triggerClassName }: Props) {
  const cache = useCache();
  const [load, loaded] = useLazyQuery(ActivityFailedChangeDocument, {
    fetchPolicy: "network-only",
  });
  const [opened, setOpened] = useState(false);
  const details = loaded.data?.accountChange;

  async function open() {
    try {
      const { data } = await load({ variables: { id: change.id } });
      if (data?.accountChange) return setOpened(true);
    } catch {
      // The chip stays, so the owner can open it again.
    }
    toast.error(t("apps.couldnt.loadFailed"));
  }

  if (!opened || details?.id !== change.id) {
    const copy = couldntChangeCopy[change.action];
    const name = change.employee
      ? `${change.employee.firstName} ${change.employee.lastName}`
      : change.email;
    return (
      <button
        type="button"
        className={triggerClassName}
        disabled={loaded.loading}
        aria-label={t(copy.title, { name, app: change.app.name })}
        onClick={() => void open()}
      >
        <WarningCircle size={13} weight="bold" aria-hidden />
        {t(copy.chip)}
      </button>
    );
  }
  return (
    <CouldntChangeDialog
      initiallyOpen
      change={details}
      row={failedChangeRow(details)}
      triggerClassName={triggerClassName}
      onClose={() => setOpened(false)}
      // A new change only the server places in the list, which may already have moved the counts.
      onChanged={() => {
        forgetAccountChanges(cache);
        forgetAccessCounts(cache);
      }}
    />
  );
}
