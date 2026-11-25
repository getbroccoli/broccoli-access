import type { AccountChangeAction } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { type ChangeTarget, useChangeAccount } from "./useChangeAccount";

type Props = {
  target: ChangeTarget;
  retryOf?: string;
  /** The failed change's action, asked again as a new change. */
  action: AccountChangeAction;
};

/** Try again on a row whose latest change failed: asks for the same change again, without a confirm. */
export function TryAgainButton({ target, action, retryOf }: Props) {
  const { changeAccount, loading } = useChangeAccount();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={loading}
      aria-label={t(LABELS[action], { name: target.name, app: target.app })}
      onClick={() => void changeAccount(target, action, retryOf)}
    >
      {t("apps.couldnt.tryAgain")}
    </Button>
  );
}

const LABELS = {
  SUSPEND: "apps.couldnt.tryAgainDisable",
  REACTIVATE: "apps.couldnt.tryAgainEnable",
  REMOVE: "apps.couldnt.tryAgainRemove",
  INVITE: "apps.couldnt.tryAgainInvite",
} as const;
