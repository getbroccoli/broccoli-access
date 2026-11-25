import { useQuery } from "@apollo/client/react";

import { ContainerConnectorsSettingsDocument } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { useRefetchAfterContainerConnectorScans } from "@/lib/useRefetchAfterContainerConnectorScans";
import { usePollWhileScanning } from "@/lib/usePollWhileScanning";

import { ContainerConnectorCard } from "./ContainerConnectorCard";

/** Settings' Apps section: a card for each app the connectors container connects; none without one. */
export function ContainerConnectorsSettings({ directoryScanning }: { directoryScanning: boolean }) {
  // A scan started elsewhere, such as on the app's page, changes the connection outside this cache.
  const query = useQuery(ContainerConnectorsSettingsDocument, { fetchPolicy: "cache-and-network" });
  const connectors = query.data?.containerConnectors ?? [];
  // A scan's results, such as its people count, commit with its end: read them once it ends.
  useRefetchAfterContainerConnectorScans(query.refetch);
  // The directory's scan can stop or restore the apps that sign in as the integration user.
  usePollWhileScanning(directoryScanning, query, query.refetch);
  if (connectors.length === 0) {
    return null;
  }
  const description = connectors.every(({ canDisableAccounts }) => canDisableAccounts)
    ? "settings.apps.description"
    : "settings.apps.descriptionMixed";

  return (
    <section aria-labelledby="apps-title" className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5">
        <h2 id="apps-title" className="text-sm font-semibold text-muted-foreground">
          {t("settings.apps.title")}
        </h2>
        <p className="text-xs text-muted-foreground">{t(description)}</p>
      </div>
      {connectors.map((connector) => (
        <ContainerConnectorCard key={connector.id} connector={connector} />
      ))}
    </section>
  );
}
