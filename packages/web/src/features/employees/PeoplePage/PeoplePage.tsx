import { toast } from "sonner";
import { useQuery } from "@apollo/client/react";
import { useNavigate, useRouteContext, useRouter, useSearch } from "@tanstack/react-router";

import {
  AccountsWithoutPersonDocument,
  PeopleDirectoryScanDocument,
  PeoplePageDocument,
} from "@/__generated__/graphql";
import { TableSearchField } from "@/components/dataTable";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { usePollWhileScanning } from "@/lib/usePollWhileScanning";
import { useRefetchAfterContainerConnectorScans } from "@/lib/useRefetchAfterContainerConnectorScans";
import { useRefetchAfterScan } from "@/lib/useRefetchAfterScan";

import { SEARCH_MAX_LENGTH } from "../peopleSearch";
import { AccountsWithoutPersonTable } from "./AccountsWithoutPersonTable";
import { PeopleHeader } from "./PeopleHeader";
import { PeopleTable } from "./PeopleTable";
import { PeopleTabs } from "./PeopleTabs";

/** People: everyone in the directory with their status and apps, and who is suspended with access. */
export function PeoplePage() {
  const { me } = useRouteContext({ from: "/_authenticated" });
  const { view: requestedView = "all", q } = useSearch({ from: "/_authenticated/people" });
  const navigate = useNavigate({ from: "/people" });
  const router = useRouter();
  const view = !me.isOwner && requestedView === "accountsWithoutPerson" ? "all" : requestedView;
  const showAccounts = view === "accountsWithoutPerson";
  const suspendedOnly = view === "suspendedWithAccess";
  // The suspended tab shows no search field, so it never searches.
  const { data, error, refetch } = useQuery(PeoplePageDocument, {
    variables: {
      showAccounts,
      isOwner: me.isOwner,
      filter: suspendedOnly ? { suspendedWithAccess: true } : { search: q },
    },
    fetchPolicy: "cache-and-network",
  });
  const directory = useQuery(PeopleDirectoryScanDocument, { fetchPolicy: "cache-and-network" });
  const accounts = useQuery(AccountsWithoutPersonDocument, {
    skip: !showAccounts,
    fetchPolicy: "cache-and-network",
  });
  const connection = directory.data?.setup.googleWorkspace;
  const isScanning = connection?.scan?.status === "SCANNING";
  usePollWhileScanning(isScanning, directory);
  const refresh = () => Promise.all([refetch(), ...(showAccounts ? [accounts.refetch()] : [])]);
  useRefetchAfterScan(isScanning, refresh);
  useRefetchAfterContainerConnectorScans(refresh);
  const people = data?.employees?.edges.map(({ node }) => node);

  return (
    <div className="flex flex-col">
      <PeopleHeader connection={connection} loaded={directory.data !== undefined} />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <PeopleTabs
          view={view}
          isOwner={me.isOwner}
          accountCount={data?.accountsWithoutPersonCount}
          counts={data?.employeeCounts}
          // All is the default, so its URL holds no view.
          onViewChange={(next) =>
            void navigate({ search: { view: next === "all" ? undefined : next } })
          }
        />
        {view === "all" && (
          <TableSearchField
            query={q}
            onQueryChange={(next) => {
              // A search that settles while a person's page loads would pull the browser back here.
              if (router.latestLocation.pathname !== "/people") return;
              void navigate({ search: (previous) => ({ ...previous, q: next }), replace: true });
            }}
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
      {((error && !data) || (showAccounts && accounts.error && !accounts.data)) && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">{t("people.error.title")}</p>
          <Button type="button" variant="outline" onClick={() => void refresh()}>
            {t("people.error.retry")}
          </Button>
        </div>
      )}
      {((!data && !error) || (showAccounts && accounts.loading && !accounts.data)) && (
        <Skeleton className="h-[300px] rounded-xl" />
      )}
      {showAccounts && accounts.data && (
        <AccountsWithoutPersonTable
          accounts={accounts.data.accountsWithoutPerson}
          loading={accounts.loading}
          refresh={refresh}
          loadMore={() =>
            void accounts
              .fetchMore({
                variables: { after: accounts.data?.accountsWithoutPerson.pageInfo.endCursor },
                updateQuery: (previous, { fetchMoreResult: next }) => ({
                  ...next,
                  accountsWithoutPerson: {
                    ...next.accountsWithoutPerson,
                    edges: [
                      ...previous.accountsWithoutPerson.edges,
                      ...next.accountsWithoutPerson.edges,
                    ],
                  },
                }),
              })
              .catch(() => toast.error(t("people.error.title")))
          }
        />
      )}
      {!showAccounts && people && (
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
