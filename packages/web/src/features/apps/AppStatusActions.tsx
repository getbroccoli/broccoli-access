import { toast } from "sonner";

import { ApproveAppDocument, IgnoreAppDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import type { AppRow } from "./AppTable";
import { forgetAppLists } from "./cache";

type Props = { app: Pick<AppRow, "id" | "name" | "status" | "connected"> };

/** Approve for an app not approved, and Ignore for one not ignored, except a connected app, which stays approved. */
export function AppStatusActions({ app }: Props) {
  // The app moves to another tab and every count changes, so the lists and counts load afresh.
  const [approve, approving] = usePayloadMutation(ApproveAppDocument, { update: forgetAppLists });
  const [ignore, ignoring] = usePayloadMutation(IgnoreAppDocument, { update: forgetAppLists });
  const pending = approving.loading || ignoring.loading;
  const change = (mutate: typeof approve | typeof ignore) =>
    void mutate({ variables: { input: { id: app.id } } }).catch(() =>
      toast.error(t("apps.statusChangeFailed", { name: app.name })),
    );

  return (
    <div className="flex justify-end gap-2">
      {app.status !== "APPROVED" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          aria-label={t("apps.approveApp", { name: app.name })}
          onClick={() => change(approve)}
        >
          {t("apps.approve")}
        </Button>
      )}
      {app.status !== "IGNORED" && !app.connected && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          aria-label={t("apps.ignoreApp", { name: app.name })}
          onClick={() => change(ignore)}
        >
          {t("apps.ignore")}
        </Button>
      )}
    </div>
  );
}
