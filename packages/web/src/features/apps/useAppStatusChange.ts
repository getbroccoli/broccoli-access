import { toast } from "sonner";

import { ApproveAppDocument, IgnoreAppDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { t } from "@/i18n";

import type { AppRow } from "./AppTable";
import { forgetAppLists } from "./cache";

/** Approve and Ignore for an app, and whether either runs, so its buttons never send both at once. */
export function useAppStatusChange(app: Pick<AppRow, "id" | "name">) {
  // The app moves to another tab and every count changes, so the lists and counts load afresh.
  const [approve, approving] = usePayloadMutation(ApproveAppDocument, { update: forgetAppLists });
  const [ignore, ignoring] = usePayloadMutation(IgnoreAppDocument, { update: forgetAppLists });
  const change = (mutate: typeof approve | typeof ignore) => () =>
    void mutate({ variables: { input: { id: app.id } } }).catch(() =>
      toast.error(t("apps.statusChangeFailed", { name: app.name })),
    );
  return {
    approve: change(approve),
    ignore: change(ignore),
    pending: approving.loading || ignoring.loading,
  };
}
