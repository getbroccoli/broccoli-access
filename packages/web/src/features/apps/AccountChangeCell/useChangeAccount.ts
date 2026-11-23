import { toast } from "sonner";

import { type AccountChangeAction, ChangeAccountDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { t } from "@/i18n";

/** The account a change is asked for, and how copy names it. */
export type ChangeTarget = { id: string; name: string; app: string };

/** Asks for a Disable or Enable; a refused ask shows a toast, and the row keeps showing the account as it is. */
export function useChangeAccount(): {
  changeAccount: (target: ChangeTarget, action: AccountChangeAction) => Promise<void>;
  loading: boolean;
} {
  const [mutate, { loading }] = usePayloadMutation(ChangeAccountDocument);
  const changeAccount = async ({ id, name, app }: ChangeTarget, action: AccountChangeAction) => {
    try {
      await mutate({ variables: { input: { id, action } } });
    } catch {
      toast.error(t("apps.change.refused", { name, app }));
    }
  };
  return { changeAccount, loading };
}
