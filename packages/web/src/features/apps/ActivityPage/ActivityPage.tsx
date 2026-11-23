import { useQuery } from "@apollo/client/react";

import { ActivityPageDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { usePollWhileScanning } from "@/lib/usePollWhileScanning";
import { PageHeader } from "@/shell";

import { AppTable } from "../AppTable";
import { ACTIVITY_COLUMNS } from "./activityColumns";

/** How many changes show before "Show n more": the recent ones a first look needs. */
const FIRST_CHANGES = 50;

/** Activity: every Disable and Enable, newest first, and how each ended. */
export function ActivityPage() {
  // A change asked elsewhere adds a row only the server places, so each visit reads afresh.
  const query = useQuery(ActivityPageDocument, { fetchPolicy: "cache-and-network" });
  const { data, error, refetch } = query;
  const changes = data?.accountChanges.edges.map(({ node }) => node);
  const isChanging = changes?.some(({ status }) => status === "RUNNING") ?? false;
  usePollWhileScanning(isChanging, query);

  return (
    <div className="flex flex-col">
      <PageHeader title={t("apps.activity.title")} description={t("apps.activity.description")} />
      {error && !data && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">{t("apps.activity.error")}</p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            {t("apps.activity.retry")}
          </Button>
        </div>
      )}
      {!data && !error && <Skeleton className="h-[300px] rounded-xl" />}
      {changes && (
        <AppTable
          rows={changes}
          columns={ACTIVITY_COLUMNS}
          firstRows={FIRST_CHANGES}
          showMoreLabel={(count) => t("apps.page.showMore", { count: String(count) })}
          emptyState={t("apps.activity.empty")}
        />
      )}
    </div>
  );
}
