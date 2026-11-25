import { useQuery } from "@apollo/client/react";
import { useNavigate, useRouteContext, useSearch } from "@tanstack/react-router";
import { useState } from "react";

import { AppsPageDocument, type AppStatus } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { APP_ACTIONS_COLUMN, APPROVED_APP_COLUMNS, FOUND_APP_COLUMNS } from "./appColumns";
import { AppsHeader } from "./AppsHeader";
import type { AppTab } from "./appsSearch";
import { AppTable } from "./AppTable";
import { AppTabs } from "./AppTabs";
import { FirstRunBanner } from "./FirstRunBanner";

// shortcut: a tab shows at most the API's largest page of apps, so selection misses any beyond
// it; page with `after` if a directory ever has that many apps.
const ALL_APPS = 10_000;

/** How many apps show before "Show n more apps": the ones a first look needs. */
const FIRST_APPS = 12;

/** What every tab's table shows besides its apps. */
const TABLE_TEXTS = {
  firstRows: FIRST_APPS,
  showMoreLabel: (count: number) => t("apps.showMore", { count: String(count) }),
  emptyState: t("apps.empty"),
};

const STATUSES = {
  approved: "APPROVED",
  discovered: "DISCOVERED",
  ignored: "IGNORED",
} as const satisfies Record<AppTab, AppStatus>;

/**
 * The company's apps by status, with when the last scan ran and Scan now. While setup waits for the
 * owner to select the apps, it opens on the discovered ones, preselected as the server suggests,
 * with the banner that finishes setup.
 */
export function AppsPage() {
  const { setupStep } = useRouteContext({ from: "/_authenticated" });
  const firstRun = setupStep === "SELECT_APPS";
  const search = useSearch({ from: "/_authenticated/apps" });
  const navigate = useNavigate({ from: "/apps" });
  const tab = search.status ?? (firstRun ? "discovered" : "approved");
  const { data, error, refetch } = useQuery(AppsPageDocument, {
    variables: {
      status: STATUSES[tab],
      first: ALL_APPS,
      approved: tab === "approved",
      discovered: tab === "discovered",
    },
    // A scan or a change elsewhere, such as in Settings, moves apps outside this cache.
    fetchPolicy: "cache-and-network",
  });
  const discovered = useQuery(AppsPageDocument, {
    variables: { status: "DISCOVERED", first: ALL_APPS, approved: false, discovered: true },
    skip: !firstRun,
  });
  // Null until the owner changes the selection, which starts with the preselected apps.
  const [selection, setSelection] = useState<Set<string> | null>(null);
  const discoveredApps = discovered.data?.apps.edges.map(({ node }) => node);
  const selected =
    selection ?? new Set(discoveredApps?.filter((app) => app.preselected).map(({ id }) => id));
  const apps = data?.apps.edges.map(({ node }) => node);
  // The banner needs the discovered apps whatever the tab, so their failure shows too.
  const failedQueries = [
    { failed: error && !data, refetch },
    { failed: discovered.error && !discovered.data, refetch: discovered.refetch },
  ].filter(({ failed }) => failed);

  return (
    <div className="flex flex-col">
      <AppsHeader canScan={!firstRun} />
      {/* Finishing ignores every app left unselected, so it waits for the selection to load. */}
      {firstRun && discoveredApps && (
        <FirstRunBanner discoveredCount={discoveredApps.length} selectedIds={selected} />
      )}
      <div className="mb-6">
        <AppTabs
          tab={tab}
          counts={data?.appCounts}
          onTabChange={(next) => void navigate({ search: { status: next } })}
        />
      </div>
      {failedQueries.length > 0 && (
        <div role="alert" className="mb-6 flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">{t("apps.loadFailed")}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => failedQueries.forEach((query) => void query.refetch())}
          >
            {t("apps.retry")}
          </Button>
        </div>
      )}
      {/* A new tab starts with its first apps only. */}
      {apps && tab === "approved" && (
        <AppTable
          key={tab}
          rows={[...apps, ...(data?.appsToConnect ?? [])]}
          columns={APPROVED_APP_COLUMNS}
          {...TABLE_TEXTS}
        />
      )}
      {apps && tab !== "approved" && (
        <AppTable
          key={tab}
          rows={apps}
          // Selecting apps for setup replaces approving them one by one.
          columns={firstRun ? FOUND_APP_COLUMNS : [...FOUND_APP_COLUMNS, APP_ACTIONS_COLUMN]}
          selection={
            firstRun && tab === "discovered"
              ? {
                  selected,
                  onChange: setSelection,
                  labelOf: ({ name }) => t("apps.select", { name }),
                }
              : undefined
          }
          {...TABLE_TEXTS}
        />
      )}
    </div>
  );
}
