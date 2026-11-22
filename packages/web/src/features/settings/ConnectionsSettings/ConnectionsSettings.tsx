import { useQuery } from "@apollo/client/react";
import { useEffect } from "react";

import { ConnectionsSettingsDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { PageHeader } from "@/shell";

import { GoogleWorkspaceCard } from "./GoogleWorkspaceCard";

/** How often the page asks for the scan's outcome while it runs. */
const POLL_INTERVAL_MS = 1_000;

/** Settings' Connections page: where Broccoli Access finds people and their accounts. */
export function ConnectionsSettings() {
  const { data, error, refetch, startPolling, stopPolling } = useQuery(ConnectionsSettingsDocument);
  const connection = data?.setup.googleWorkspace;
  const isScanning = connection?.scan?.status === "SCANNING";
  useEffect(() => {
    if (!isScanning) {
      return;
    }
    startPolling(POLL_INTERVAL_MS);
    return stopPolling;
  }, [isScanning, startPolling, stopPolling]);

  return (
    <div className="flex max-w-4xl flex-col">
      <PageHeader
        title={t("settings.connections.title")}
        description={t("settings.connections.description")}
      />
      {connection ? (
        <GoogleWorkspaceCard connection={connection} />
      ) : error ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">{t("settings.connections.loadFailed")}</p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            {t("settings.connections.retry")}
          </Button>
        </div>
      ) : (
        !data && <Skeleton className="h-[150px] rounded-xl" />
      )}
    </div>
  );
}
