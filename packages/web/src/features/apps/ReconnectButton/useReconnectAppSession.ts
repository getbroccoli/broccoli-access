import { useEffect } from "react";
import { toast } from "sonner";

import { ReconnectContainerConnectorDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { t } from "@/i18n";

import { useAppSessionHandOver } from "../ConnectAppSessionDialog";

/**
 * Reconnects `connector` with the owner's app session: `start` opens the extension's hand-over
 * window, and the session it hands over reconnects at once, since the owner chose Reconnect.
 */
export function useReconnectAppSession(connector: { id: string; name: string }) {
  const handOver = useAppSessionHandOver(connector.id);
  // The payload carries the connection's new status and its app's users' offers.
  const [reconnect, reconnecting] = usePayloadMutation(ReconnectContainerConnectorDocument);
  const appSession = handOver.handOver?.appSession ?? null;
  const { reset } = handOver;
  // The session comes back from the server once the extension's window has closed.
  useEffect(() => {
    if (!appSession) {
      return;
    }
    const input = { connector: connector.id, appSession };
    // `usePayloadMutation` keeps a failure for display, so the rejection needs no handling here.
    void reconnect({ variables: { input } }).then(
      () => toast.success(t("apps.reconnect.done", { app: connector.name })),
      () => undefined,
    );
    // Read once: the hand-over is spent.
    reset();
  }, [appSession, connector.id, connector.name, reconnect, reset]);

  return {
    start: () => {
      reconnecting.reset();
      handOver.reset();
      handOver.start();
    },
    handOver,
    reconnecting,
  };
}
