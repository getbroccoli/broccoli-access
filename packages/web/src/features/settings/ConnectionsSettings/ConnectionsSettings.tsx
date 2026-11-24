import { useQuery } from "@apollo/client/react";

import { ConnectionsSettingsDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { usePollWhileScanning } from "@/lib/usePollWhileScanning";
import { PageHeader } from "@/shell";

import { ContainerConnectorsSettings } from "../ContainerConnectorsSettings";
import { ChromeExtensionCard } from "./ChromeExtensionCard";
import type { IntegrationUserError } from "./connectionsSearch";
import { GoogleWorkspaceCard } from "./GoogleWorkspaceCard";
import { IntegrationUserCard } from "./IntegrationUserCard";

type Props = {
  /** Why the last creation of the integration user failed, from Google's redirect back. */
  integrationUserError: IntegrationUserError | undefined;
};

/** Settings' Connections page: where Broccoli Access finds people and their accounts. */
export function ConnectionsSettings({ integrationUserError }: Props) {
  // A scan started elsewhere, such as in another tab, changes the connection outside this cache.
  const query = useQuery(ConnectionsSettingsDocument, { fetchPolicy: "cache-and-network" });
  const { data, error, refetch } = query;
  const connection = data?.setup.googleWorkspace;
  usePollWhileScanning(connection?.scan?.status === "SCANNING", query);

  return (
    <div className="flex max-w-4xl flex-col">
      <PageHeader
        title={t("settings.connections.title")}
        description={t("settings.connections.description")}
      />
      <div className="flex flex-col gap-6">
        <section aria-labelledby="directory-title" className="flex flex-col gap-2.5">
          <h2 id="directory-title" className="text-sm font-semibold text-muted-foreground">
            {t("settings.connections.directory")}
          </h2>
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
        </section>
        {connection && (
          <section aria-labelledby="integration-user-section" className="flex flex-col gap-2.5">
            <h2
              id="integration-user-section"
              className="text-sm font-semibold text-muted-foreground"
            >
              {t("settings.integrationUser.section")}
            </h2>
            <IntegrationUserCard
              integrationUser={data.setup.integrationUser}
              domain={connection.domain}
              usesOwnGoogleApp={connection.googleApp === "OWN_GOOGLE_APP"}
              failure={integrationUserError}
            />
          </section>
        )}
        <ContainerConnectorsSettings />
      </div>
      <ChromeExtensionCard />
    </div>
  );
}
