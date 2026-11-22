import { useQuery } from "@apollo/client/react";
import { useParams } from "@tanstack/react-router";

import { AppConnectionScanDocument, AppPageDocument } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { usePollWhileScanning } from "@/lib/usePollWhileScanning";
import { useRefetchAfterScan } from "@/lib/useRefetchAfterScan";

import { AppTable } from "../AppTable";
import { AppHeader } from "./AppHeader";
import { CountCard } from "./CountCard";
import { userColumns } from "./userColumns";

/** How many users show before "Show n more": the ones a first look needs. */
const FIRST_USERS = 8;

/** An app: its status and actions, how many use it and keep access though suspended, and its users. */
export function AppPage() {
  const { appId } = useParams({ from: "/_authenticated/apps_/$appId" });
  // The route's loader has just read the page into the cache.
  const { data, refetch } = useQuery(AppPageDocument, { variables: { id: appId } });
  const app = data?.app;
  // A connected app's scan moves its users: poll its status only, then read the users once.
  const scanQuery = useQuery(AppConnectionScanDocument, { skip: !app?.containerConnection });
  const isScanning = app?.containerConnection?.scan?.status === "SCANNING";
  usePollWhileScanning(isScanning, scanQuery);
  useRefetchAfterScan(isScanning, refetch);
  // The route's loader found the app, so it is missing only while a reload replaces it.
  if (!app) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Connecting changes what only the server computes: the status, connection and users. */}
      <AppHeader app={app} onConnected={() => void refetch()} />
      <div className="grid gap-4 sm:grid-cols-2">
        <CountCard label={t("apps.page.users")} count={app.peopleCount} />
        <CountCard
          label={t("apps.page.suspendedWithAccess")}
          count={app.suspendedWithAccessCount}
          warning={app.suspendedWithAccessCount > 0}
        />
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{t("apps.page.users")}</h2>
        <AppTable
          rows={app.users}
          columns={userColumns(
            app.containerConnection && {
              name: app.name,
              findingKind: app.containerConnection.connector.findingKind,
            },
          )}
          firstRows={FIRST_USERS}
          showMoreLabel={(count) => t("apps.page.showMore", { count: String(count) })}
          emptyState={t("apps.page.noUsers")}
        />
      </section>
    </div>
  );
}
