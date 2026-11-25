import { useLazyQuery } from "@apollo/client/react";
import { WarningCircle } from "@phosphor-icons/react";
import { toast } from "sonner";

import { ActivityFailedChangeDocument } from "@/__generated__/graphql";
import { useCache } from "@/apollo";
import { t } from "@/i18n";

import { CouldntChangeDialog, couldntChangeCopy } from "../AccountChangeCell";
import { forgetAccountChanges } from "../cache";
import type { AccountChangeRow } from "./accountChangeRow";
import { failedChangeRow } from "./failedChangeRow";

type Props = {
  change: Pick<AccountChangeRow, "id" | "action" | "email" | "app" | "employee">;
  /** The chip's look. */
  triggerClassName: string;
};

/**
 * "Couldn't disable" and the like on Activity: opening it reads the change with its person's rows,
 * so the dialog shows its tries and, while it is the row's latest change, what helps now.
 */
export function ActivityCouldntChange({ change, triggerClassName }: Props) {
  const cache = useCache();
  const [load, loaded] = useLazyQuery(ActivityFailedChangeDocument);
  const details = loaded.data?.accountChange;
  const name = change.employee
    ? `${change.employee.firstName} ${change.employee.lastName}`
    : change.email;

  async function open() {
    try {
      const { data } = await load({ variables: { id: change.id } });
      if (data?.accountChange) return;
    } catch {
      // The chip stays, so the owner can open it again.
    }
    toast.error(t("apps.couldnt.loadFailed"));
  }

  if (details?.id !== change.id) {
    const copy = couldntChangeCopy[change.action];
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
      key={change.id}
      initiallyOpen
      change={details}
      row={failedChangeRow({ ...details, app: change.app })}
      triggerClassName={triggerClassName}
      // Try again adds a change only the server places in the list.
      onChanged={() => forgetAccountChanges(cache)}
    />
  );
}
