import type { AppAccountStatus } from "@/__generated__/graphql";
import { t } from "@/i18n";

import { StatusBadge } from "./StatusBadge";

type Props = {
  status: AppAccountStatus;
};

/** An account's status in its app; a suspended one shows as Disabled, matching Disable and Enable. */
export function AppAccountStatusBadge({ status }: Props) {
  return (
    <StatusBadge tone={status === "SUSPENDED" ? "muted" : "active"}>
      {t(status === "SUSPENDED" ? "apps.page.inApp.disabled" : "apps.page.inApp.active")}
    </StatusBadge>
  );
}
