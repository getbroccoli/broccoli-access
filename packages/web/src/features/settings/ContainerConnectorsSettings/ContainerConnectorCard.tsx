import type { ContainerConnectorsSettingsQuery } from "@/__generated__/graphql";
import { AppMark } from "@/components/AppMark";
import { Button } from "@/components/ui/button";
import {
  ConnectAppSessionDialog,
  ConnectContainerConnectorDialog,
  connectingFieldName,
  connectsWithText,
  ReconnectButton,
} from "@/features/apps";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";
import { ScanNowButton } from "@/components/ScanNowButton";

import { ConnectionSummary } from "./ConnectionSummary";
import { ConnectorStatusBadge } from "./ConnectorStatusBadge";
import { ReconnectSummary } from "./ReconnectSummary";

export type ContainerConnector = ContainerConnectorsSettingsQuery["containerConnectors"][number];

type Props = {
  connector: ContainerConnector;
};

/**
 * One app the connectors container connects: how it connects, its connection and last scan, or
 * why it needs reconnecting.
 */
export function ContainerConnectorCard({ connector }: Props) {
  const { connection } = connector;
  const titleId = `connector-${connector.id}-title`;
  const needsReconnect = connection?.status === "RECONNECT";

  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        "flex flex-col gap-4 rounded-xl border p-6 sm:flex-row sm:items-start",
        needsReconnect ? "border-amber-200 bg-amber-50/60" : "border-border",
      )}
    >
      {/* A container connector's key is its app's catalog key, which picks the logo. */}
      <AppMark
        name={connector.name}
        catalogKey={connector.id}
        className="size-11 rounded-lg text-lg"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={titleId} className="text-base font-semibold">
            {connector.name}
          </h3>
          <ConnectorStatusBadge connection={connection} />
        </div>
        {connection && needsReconnect && (
          <ReconnectSummary connector={connector} connection={connection} />
        )}
        {connection && !needsReconnect && (
          <ConnectionSummary connector={connector} connection={connection} />
        )}
        {!connection && <p className="text-sm text-foreground/80">{howItConnects(connector)}</p>}
      </div>
      {connection && (
        <div className="flex shrink-0 flex-wrap items-start gap-2">
          {!needsReconnect && (
            <ScanNowButton
              connectionId={connection.id}
              isScanning={connection.scan?.status === "SCANNING"}
              className="items-start pb-0"
            />
          )}
          {/* One dialog in both states, so a status change during a scan keeps a key being typed. */}
          {connectsWithText(connector) ? (
            <ConnectContainerConnectorDialog
              connector={connector}
              trigger={
                <Button
                  type="button"
                  variant={needsReconnect ? "default" : "outline"}
                  size="lg"
                  className="px-4"
                >
                  {t(needsReconnect ? "apps.reconnect.pasteNewKey" : "settings.apps.changeKey")}
                </Button>
              }
            />
          ) : (
            needsReconnect && <ReconnectButton connector={connector} />
          )}
        </div>
      )}
      {!connection && (
        <div className="shrink-0">
          {connectsWithText(connector) ? (
            <ConnectContainerConnectorDialog connector={connector} />
          ) : (
            <ConnectAppSessionDialog connector={connector} />
          )}
        </div>
      )}
    </article>
  );
}

function howItConnects(connector: ContainerConnector): string {
  if (!connectsWithText(connector)) {
    return t("settings.apps.throughAppSession", { app: connector.name });
  }
  const field = connectingFieldName(connector.connectionFields);
  return t("settings.apps.throughApi", { app: connector.name, field });
}
