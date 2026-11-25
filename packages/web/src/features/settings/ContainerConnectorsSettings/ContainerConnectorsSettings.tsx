import { useQuery } from "@apollo/client/react";

import { ContainerConnectorsSettingsDocument } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { useRefetchAfterContainerConnectorScans } from "@/lib/useRefetchAfterContainerConnectorScans";
import { usePollWhileScanning } from "@/lib/usePollWhileScanning";
import { PageHeader } from "@/shell";

import { ChromeExtensionCard } from "./ChromeExtensionCard";
import { ContainerConnectorCard } from "./ContainerConnectorCard";

export function ContainerConnectorsSettings() {
  // A scan started elsewhere, such as on the app's page, changes the connection outside this cache.
  const query = useQuery(ContainerConnectorsSettingsDocument, { fetchPolicy: "cache-and-network" });
  const connectors = query.data?.containerConnectors ?? [];
  // A scan's results, such as its people count, commit with its end: read them once it ends.
  useRefetchAfterContainerConnectorScans(query.refetch);
  // The directory's scan can stop or restore the apps that sign in as the integration user.
  const directoryScanning = query.data?.setup.googleWorkspace?.scan?.status === "SCANNING";
  usePollWhileScanning(directoryScanning, query, query.refetch);
  const canDisableAllAccounts = connectors.every(({ canDisableAccounts }) => canDisableAccounts);

  return (
    <div className="flex max-w-4xl flex-col">
      <PageHeader title={t("settings.apps.title")} description={t("settings.apps.intro")} />
      {connectors.length > 0 && (
        <section aria-label={t("settings.apps.title")} className="flex flex-col gap-2.5">
          {canDisableAllAccounts && (
            <p className="text-xs text-muted-foreground">{t("settings.apps.description")}</p>
          )}
          {connectors.map((connector) => (
            <ContainerConnectorCard key={connector.id} connector={connector} />
          ))}
        </section>
      )}
      <ChromeExtensionCard />
    </div>
  );
}
