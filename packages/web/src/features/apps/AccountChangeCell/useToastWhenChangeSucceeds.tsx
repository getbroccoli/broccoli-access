import { useQuery } from "@apollo/client/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useRef } from "react";
import { toast } from "sonner";

import {
  type AccountChangeAction,
  type AccountChangeCell_AppUserFragment,
  RemovalOutcomeDocument,
} from "@/__generated__/graphql";
import { t } from "@/i18n";

/** The running change a row saw, with the words its toast needs once the row may be gone. */
type Running = { id: string; action: AccountChangeAction; name: string; app: string };

/** Shows a toast when a change this row saw running succeeds, wherever it was asked. */
export function useToastWhenChangeSucceeds(user: AccountChangeCell_AppUserFragment | null): void {
  // Read only once the row may be gone, so by its client, which outlives the row.
  const { client } = useQuery(RemovalOutcomeDocument, { variables: { id: "" }, skip: true });
  const running = useRef<Running | null>(null);
  const change = user?.latestChange;
  // A Remove takes the account, and with it the change this row read: its end is asked for.
  const toastIfRemoved = useEffectEvent(() => {
    const seen = running.current;
    running.current = null;
    if (seen?.action !== "REMOVE") return;
    void client
      .query({ query: RemovalOutcomeDocument, variables: { id: seen.id }, fetchPolicy: "no-cache" })
      .then(({ data }) => data?.accountChange?.status === "SUCCEEDED" && toastSuccess(seen))
      // The toast is a courtesy: the page already shows the account gone.
      .catch(() => undefined);
  });
  useEffect(() => {
    if (change?.status === "RUNNING" && user) {
      running.current = {
        id: change.id,
        action: change.action,
        name: user.email,
        app: user.app.name,
      };
      return;
    }
    const seen = running.current;
    if (!seen) return;
    if (change?.id !== seen.id) {
      toastIfRemoved();
      return;
    }
    running.current = null;
    if (change.status === "SUCCEEDED") toastSuccess(seen);
  }, [user, change]);
  // The row itself left the page with the account.
  useEffect(() => () => toastIfRemoved(), []);
}

function toastSuccess({ action, name, app }: Running): void {
  toast.success(
    t(
      action === "REMOVE"
        ? "apps.change.removedToast"
        : action === "SUSPEND"
          ? "apps.change.disabledToast"
          : "apps.change.enabledToast",
      { name, app },
    ),
    // The row's outcome, apart from the answers to clicks at the top.
    { position: "bottom-right", invert: true, action: VIEW_IN_ACTIVITY },
  );
}

const VIEW_IN_ACTIVITY = (
  <Link
    to="/activity"
    className="ml-auto font-semibold whitespace-nowrap underline-offset-2 hover:underline"
  >
    {t("apps.change.viewInActivity")}
  </Link>
);
