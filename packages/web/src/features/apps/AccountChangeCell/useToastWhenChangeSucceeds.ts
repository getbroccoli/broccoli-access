import { useEffect, useRef } from "react";
import { toast } from "sonner";

import type { AccountChangeCell_AppUserFragment } from "@/__generated__/graphql";
import { t } from "@/i18n";

/** Shows a toast when a change this row saw running succeeds, wherever it was asked. */
export function useToastWhenChangeSucceeds(user: AccountChangeCell_AppUserFragment | null): void {
  const runningChangeId = useRef<string | null>(null);
  const change = user?.latestChange;
  useEffect(() => {
    if (!user || !change) {
      return;
    }
    if (change.status === "RUNNING") {
      runningChangeId.current = change.id;
      return;
    }
    if (change.id !== runningChangeId.current) {
      return;
    }
    runningChangeId.current = null;
    if (change.status === "SUCCEEDED") {
      const params = {
        name: `${user.employee.firstName} ${user.employee.lastName}`,
        app: user.app.name,
      };
      toast.success(
        t(
          change.action === "SUSPEND" ? "apps.change.disabledToast" : "apps.change.enabledToast",
          params,
        ),
        // The row's outcome, apart from the answers to clicks at the top.
        { position: "bottom-right", invert: true },
      );
    }
  }, [user, change]);
}
