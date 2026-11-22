import { useQuery } from "@apollo/client/react";
import { useParams } from "@tanstack/react-router";

import { AppConnectionScanDocument, AppPageDocument } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { usePollWhileScanning } from "@/lib/usePollWhileScanning";
import { useRefetchAfterScan } from "@/lib/useRefetchAfterScan";

import { AppTable } from "../AppTable";
import { useRefreshAfterChanges } from "../useRefreshAfterChanges";
import { AppHeader } from "./AppHeader";
import { CountCard } from "./CountCard";
import { userColumns } from "./userColumns";

/** How many users show before "Show n more": the ones a first look needs. */
const FIRST_USERS = 8;

/** An app: its status and actions, how many use it and keep access though suspended, and its users. */
export function AppPage() {
  const { appId } = useParams({ from: "/_authenticated/apps_/$appId" });
  // The route's loader has just read the page into the cache.
  const pageQuery = useQuery(AppPageDocument, { variables: { id: appId } });
  const { data, refetch } = pageQuery;
  const app = data?.app;
  // A connected app's scan moves its users: poll its status only, then read the users once.
  const scanQuery = useQuery(AppConnectionScanDocument, { skip: !app?.containerConnection });
  const isScanning = app?.containerConnection?.scan?.status === "SCANNING";
  usePollWhileScanning(isScanning, scanQuery);
  useRefetchAfterScan(isScanning, refetch);
  // A running change moves its row; the page reads its users again until every change ends.
  // shortcut: reads every user each second while a change runs; poll only the running rows once
  // apps with thousands of users connect.
  const isChanging = app?.users.some((user) => user.latestChange?.status === "RUNNING") ?? false;
  usePollWhileScanning(isChanging, pageQuery);
  useRefreshAfterChanges(isChanging, refetch);
  // The route's loader found the app, so it is missing only while a reload replaces it.
  if (!app) {
    return null;
  }
  const workspace = app.containerConnection?.scan?.sourceName;

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
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-lg font-semibold tracking-tight">{t("apps.page.users")}</h2>
          {app.canChangeAccounts && workspace && (
            <p className="text-sm text-muted-foreground">
              {t("apps.page.changesActIn", { workspace })}
            </p>
          )}
        </div>
        <AppTable
          rows={app.users}
          columns={userColumns(
            app.containerConnection && {
              name: app.name,
              findingKind: app.containerConnection.connector.findingKind,
              canChangeAccounts: app.canChangeAccounts,
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
