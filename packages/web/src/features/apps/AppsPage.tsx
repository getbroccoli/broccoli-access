import { useQuery } from "@apollo/client/react";
import { useNavigate, useRouteContext, useSearch } from "@tanstack/react-router";
import { useState } from "react";

import { AppsPageDocument, type AppStatus } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { FOUND_APP_COLUMNS } from "./appColumns";
import type { AppTab } from "./appsSearch";
import { AppTable } from "./AppTable";
import { AppTabs } from "./AppTabs";
import { FirstRunBanner } from "./FirstRunBanner";

// shortcut: a tab shows at most the API's largest page of apps, so selection misses any beyond
// it; page with `after` if a directory ever has that many apps.
const ALL_APPS = 10_000;

const STATUSES = {
  approved: "APPROVED",
  discovered: "DISCOVERED",
  ignored: "IGNORED",
} as const satisfies Record<AppTab, AppStatus>;

/**
 * The company's apps by status. While setup waits for the owner to select the apps, it opens on
 * the discovered ones, preselected as the server suggests, with the banner that finishes setup.
 */
export function AppsPage() {
  const { setupStep } = useRouteContext({ from: "/_authenticated" });
  const firstRun = setupStep === "SELECT_APPS";
  const search = useSearch({ from: "/_authenticated/apps" });
  const navigate = useNavigate({ from: "/apps" });
  const tab = search.status ?? (firstRun ? "discovered" : "approved");
  const { data, error, refetch } = useQuery(AppsPageDocument, {
    variables: { status: STATUSES[tab], first: ALL_APPS },
  });
  const discovered = useQuery(AppsPageDocument, {
    variables: { status: "DISCOVERED", first: ALL_APPS },
    skip: !firstRun,
  });
  // Null until the owner changes the selection, which starts with the preselected apps.
  const [selection, setSelection] = useState<Set<string> | null>(null);
  const discoveredApps = discovered.data?.apps.edges.map(({ node }) => node);
  const selected =
    selection ?? new Set(discoveredApps?.filter((app) => app.preselected).map(({ id }) => id));
  const apps = data?.apps.edges.map(({ node }) => node);

  return (
    <div className="flex flex-col">
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
      {error && !data && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">{t("apps.loadFailed")}</p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            {t("apps.retry")}
          </Button>
        </div>
      )}
      {apps && (
        <AppTable
          // A new tab starts with its first apps only.
          key={tab}
          apps={apps}
          columns={FOUND_APP_COLUMNS}
          selection={
            firstRun && tab === "discovered" ? { selected, onChange: setSelection } : undefined
          }
          emptyState={t("apps.empty")}
        />
      )}
    </div>
  );
}
