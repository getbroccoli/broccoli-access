import { useQuery } from "@apollo/client/react";

import { ContainerConnectorsSettingsDocument } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { usePollWhileScanning } from "@/lib/usePollWhileScanning";

import { ContainerConnectorCard } from "./ContainerConnectorCard";

/** Settings' Apps section: a card for each app the connectors container connects; none without one. */
export function ContainerConnectorsSettings() {
  // A scan started elsewhere, such as on the app's page, changes the connection outside this cache.
  const query = useQuery(ContainerConnectorsSettingsDocument, { fetchPolicy: "cache-and-network" });
  const connectors = query.data?.containerConnectors ?? [];
  usePollWhileScanning(
    connectors.some(({ connection }) => connection?.scan?.status === "SCANNING"),
    query,
  );
  if (connectors.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="apps-title" className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5">
        <h2 id="apps-title" className="text-sm font-semibold text-muted-foreground">
          {t("settings.apps.title")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("settings.apps.description")}</p>
      </div>
      {connectors.map((connector) => (
        <ContainerConnectorCard key={connector.id} connector={connector} />
      ))}
    </section>
  );
}
