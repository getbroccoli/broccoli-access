import { useQuery } from "@apollo/client/react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { PeoplePageDocument } from "@/__generated__/graphql";
import { TableSearchField } from "@/components/dataTable";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { usePollWhileScanning } from "@/lib/usePollWhileScanning";
import { useRefetchAfterScan } from "@/lib/useRefetchAfterScan";

import { SEARCH_MAX_LENGTH } from "../peopleSearch";
import { PeopleHeader } from "./PeopleHeader";
import { PeopleTable } from "./PeopleTable";
import { PeopleTabs } from "./PeopleTabs";

/** People: everyone in the directory with their status and apps, and who is suspended with access. */
export function PeoplePage() {
  const { view = "all", q } = useSearch({ from: "/_authenticated/people" });
  const navigate = useNavigate({ from: "/people" });
  const suspendedOnly = view === "suspendedWithAccess";
  // The suspended tab shows no search field, so it never searches.
  const { data, error, refetch, startPolling, stopPolling } = useQuery(PeoplePageDocument, {
    variables: { filter: suspendedOnly ? { suspendedWithAccess: true } : { search: q } },
    fetchPolicy: "cache-and-network",
  });
  const connection = data?.setup.googleWorkspace;
  const isScanning = connection?.scan?.status === "SCANNING";
  usePollWhileScanning(isScanning, { startPolling, stopPolling });
  // The read that saw the scan end may have read the people before the scan saved them.
  useRefetchAfterScan(isScanning, refetch);
  const people = data?.employees.edges.map(({ node }) => node);

  return (
    <div className="flex flex-col">
      <PeopleHeader connection={connection} loaded={data !== undefined} />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <PeopleTabs
          view={view}
          counts={data?.employeeCounts}
          // All is the default, so its URL holds no view.
          onViewChange={(next) =>
            void navigate({ search: { view: next === "all" ? undefined : next } })
          }
        />
        {!suspendedOnly && (
          <TableSearchField
            query={q}
            onQueryChange={(next) =>
              void navigate({
                search: (previous) => ({ ...previous, q: next }),
                replace: true,
              })
            }
            label={t("people.search.label")}
            placeholder={t("people.search.placeholder")}
            maxLength={SEARCH_MAX_LENGTH}
          />
        )}
      </div>
      {suspendedOnly && (
        <p className="mb-4 text-sm text-foreground/80">
          {t("people.suspendedWithAccess.description")}
        </p>
      )}
      {error && !data && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">{t("people.error.title")}</p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            {t("people.error.retry")}
          </Button>
        </div>
      )}
      {!data && !error && <Skeleton className="h-[300px] rounded-xl" />}
      {people && (
        <PeopleTable
          // A new tab or search starts with its first people only.
          key={`${view} ${q ?? ""}`}
          people={people}
          appsHeader={t(suspendedOnly ? "people.column.stillHasAccessTo" : "people.column.apps")}
          emptyState={emptyStateOf(suspendedOnly, q)}
        />
      )}
    </div>
  );
}

function emptyStateOf(suspendedOnly: boolean, query: string | undefined): string {
  if (suspendedOnly) {
    return t("people.suspendedWithAccess.empty");
  }
  return query ? t("people.noResults.title", { query }) : t("people.empty.title");
}
