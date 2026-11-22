import type { ContainerConnectorsSettingsQuery } from "@/__generated__/graphql";
import { AppMark } from "@/components/AppMark";
import {
  ConnectAppSessionDialog,
  ConnectContainerConnectorDialog,
  connectingFieldName,
  connectsWithText,
} from "@/features/apps";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";
import { ScanNowButton } from "@/shell";

import { ConnectionSummary } from "./ConnectionSummary";

export type ContainerConnector = ContainerConnectorsSettingsQuery["containerConnectors"][number];

type Props = {
  connector: ContainerConnector;
};

/** One app the connectors container connects: how it connects, or its connection and last scan. */
export function ContainerConnectorCard({ connector }: Props) {
  const { connection } = connector;
  const titleId = `connector-${connector.id}-title`;

  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-xl border border-border p-6 sm:flex-row sm:items-start"
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
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              connection ? "bg-brand-soft text-brand-deep" : "bg-muted text-foreground/70",
            )}
          >
            {t(connection ? "settings.connections.connected" : "settings.apps.notConnected")}
          </span>
        </div>
        {connection ? (
          <ConnectionSummary connector={connector} connection={connection} />
        ) : (
          <p className="text-sm text-foreground/80">{howItConnects(connector)}</p>
        )}
      </div>
      {connection ? (
        <ScanNowButton
          connectionId={connection.id}
          isScanning={connection.scan?.status === "SCANNING"}
          className="shrink-0 items-start pb-0"
        />
      ) : (
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
