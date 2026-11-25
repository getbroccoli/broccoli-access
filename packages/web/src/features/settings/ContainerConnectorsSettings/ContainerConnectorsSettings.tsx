import { NetworkStatus } from "@apollo/client";
import { useQuery } from "@apollo/client/react";

import {
  ContainerConnectorsSettingsDocument,
  DirectoryScanDocument,
} from "@/__generated__/graphql";
import { t } from "@/i18n";
import { useRefetchAfterContainerConnectorScans } from "@/lib/useRefetchAfterContainerConnectorScans";
import { usePollWhileScanning } from "@/lib/usePollWhileScanning";
import { PageHeader } from "@/shell";

import { ChromeExtensionCard } from "./ChromeExtensionCard";
import { ContainerConnectorCard } from "./ContainerConnectorCard";

export function ContainerConnectorsSettings() {
  // Read the directory first so the cards can't miss a scan that just changed their connections.
  const directoryScan = useQuery(DirectoryScanDocument, { fetchPolicy: "cache-and-network" });
  const query = useQuery(ContainerConnectorsSettingsDocument, {
    fetchPolicy: "cache-and-network",
    skip: directoryScan.networkStatus === NetworkStatus.loading,
    // A scan-end refresh needs its own request even when the initial read is still in flight.
    context: { queryDeduplication: false },
  });
  const connectors = query.data?.containerConnectors ?? [];
  useRefetchAfterContainerConnectorScans(query.refetch);
  const directoryScanning = directoryScan.data?.setup.googleWorkspace?.scan?.status === "SCANNING";
  usePollWhileScanning(directoryScanning, directoryScan, query.refetch);

  return (
    <div className="flex max-w-4xl flex-col">
      <PageHeader title={t("settings.apps.title")} description={t("settings.apps.description")} />
      {connectors.length > 0 && (
        <section aria-label={t("settings.apps.title")} className="flex flex-col gap-2.5">
          {connectors.map((connector) => (
            <ContainerConnectorCard key={connector.id} connector={connector} />
          ))}
        </section>
      )}
      <ChromeExtensionCard />
    </div>
  );
}
