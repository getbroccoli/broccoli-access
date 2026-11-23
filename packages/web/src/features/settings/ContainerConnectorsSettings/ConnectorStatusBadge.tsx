import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import type { ContainerConnector } from "./ContainerConnectorCard";

type Props = {
  connection: Pick<NonNullable<ContainerConnector["connection"]>, "status"> | null;
};

/** Connected, Reconnect while its key or session stopped working, or Not connected. */
export function ConnectorStatusBadge({ connection }: Props) {
  const needsReconnect = connection?.status === "RECONNECT";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        needsReconnect && "bg-amber-100 text-amber-900",
        connection && !needsReconnect && "bg-brand-soft text-brand-deep",
        !connection && "bg-muted text-foreground/70",
      )}
    >
      {needsReconnect && t("apps.reconnect.badge")}
      {connection && !needsReconnect && t("settings.connections.connected")}
      {!connection && t("settings.apps.notConnected")}
    </span>
  );
}
