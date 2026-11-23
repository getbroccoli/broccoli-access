import type { AccountChangeAction } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { type ChangeTarget, useChangeAccount } from "./useChangeAccount";

type Props = {
  target: ChangeTarget;
  /** The failed change's action, asked again as a new change. */
  action: AccountChangeAction;
};

/** Try again on the row of an account whose latest change failed: asks for the same change again, without a confirm. */
export function TryAgainButton({ target, action }: Props) {
  const { changeAccount, loading } = useChangeAccount();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={loading}
      aria-label={t(
        action === "SUSPEND" ? "apps.couldnt.tryAgainDisable" : "apps.couldnt.tryAgainEnable",
        {
          name: target.name,
          app: target.app,
        },
      )}
      onClick={() => void changeAccount(target, action)}
    >
      {t("apps.couldnt.tryAgain")}
    </Button>
  );
}
