import { useAccountsWithoutPerson } from "./useAccountsWithoutPerson";
import { useQuery } from "@apollo/client/react";
import { useNavigate, useRouteContext, useRouter, useSearch } from "@tanstack/react-router";

import {
  AccountsWithoutPersonCountDocument,
  DirectoryScanDocument,
  PeopleDifferencesDocument,
  PeoplePageDocument,
} from "@/__generated__/graphql";
import { TableSearchField } from "@/components/dataTable";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRefreshDifferences } from "@/features/apps";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";
import { usePollWhileScanning } from "@/lib/usePollWhileScanning";
import { useRefetchAfterContainerConnectorScans } from "@/lib/useRefetchAfterContainerConnectorScans";
import { useRefetchAfterScan } from "@/lib/useRefetchAfterScan";
import { PageHeader } from "@/shell";

import { SEARCH_MAX_LENGTH } from "../peopleSearch";
import { AccountsWithoutPersonTable } from "./AccountsWithoutPersonTable";
import { DifferencesPanel } from "./DifferencesPanel";
import { MarkedAccountsTable } from "./MarkedAccountsTable";
import { PeopleHeader } from "./PeopleHeader";
import { PeopleTable } from "./PeopleTable";
import { PeopleTabs } from "./PeopleTabs";

/** People: everyone in the directory with their status and apps, and who is suspended with access. */
export function PeoplePage() {
  const { me } = useRouteContext({ from: "/_authenticated" });
  const { view: requestedView = "all", q } = useSearch({ from: "/_authenticated/people" });
  const navigate = useNavigate({ from: "/people" });
  const router = useRouter();
  const canManage = me.operations.includes("MANAGE_WORKSPACE");
  const canOpenView =
    requestedView === "differences"
      ? canManage
      : requestedView !== "accountsWithoutPerson" || me.isOwner;
  const view = canOpenView ? requestedView : "all";
  const showAccounts = view === "accountsWithoutPerson";
  const showDifferences = view === "differences";
  const suspendedOnly = view === "suspendedWithAccess";
  // The suspended tab shows no search field, so it never searches.
  const { data, error, refetch } = useQuery(PeoplePageDocument, {
    variables: {
      skipPeople: showAccounts || showDifferences,
      filter: suspendedOnly ? { suspendedWithAccess: true } : { search: q },
    },
    fetchPolicy: "cache-and-network",
  });
  const directory = useQuery(DirectoryScanDocument, { fetchPolicy: "cache-and-network" });
  const differences = useQuery(PeopleDifferencesDocument, {
    skip: !canManage,
    variables: { showDifferences },
    fetchPolicy: "cache-and-network",
  });
  const access = differences.data?.accessDifferences;
  useRefreshDifferences(
    [
      ...(access?.runningChangeIds ?? []),
      ...(access?.missing?.flatMap(({ latestProvisionChange }) =>
        latestProvisionChange?.status === "RUNNING" ? [latestProvisionChange.id] : [],
      ) ?? []),
      ...(access?.extra?.flatMap(({ activeAccounts }) =>
        activeAccounts.flatMap(({ latestChange }) =>
          latestChange?.status === "RUNNING" ? [latestChange.id] : [],
        ),
      ) ?? []),
    ],
    differences.refetch,
  );
  const badge = useQuery(AccountsWithoutPersonCountDocument, {
    skip: !me.isOwner,
    fetchPolicy: "cache-and-network",
  });
  const { accounts, marked } = useAccountsWithoutPerson(showAccounts);
  const refreshAccounts = async () => {
    await Promise.allSettled([accounts.refresh(), marked.refresh()]);
    // The count is read after the list, so an account a removal took off the list has left it too.
    return badge.refetch();
  };
  const connection = directory.data?.setup.googleWorkspace;
  const isScanning = connection?.scan?.status === "SCANNING";
  usePollWhileScanning(isScanning, directory);
  const refresh = () =>
    Promise.allSettled([
      refetch(),
      ...(canManage ? [differences.refetch()] : []),
      ...(me.isOwner ? [badge.refetch()] : []),
      ...(showAccounts ? [accounts.refresh(), marked.refresh()] : []),
    ]);
  useRefetchAfterScan(isScanning, refresh);
  useRefetchAfterContainerConnectorScans(refresh);
  const people = data?.employees?.edges.map(({ node }) => node);

  return (
    <div className="flex flex-col">
      {showDifferences ? (
        <PageHeader title={t("people.title")} />
      ) : (
        <PeopleHeader connection={connection} loaded={directory.data !== undefined} />
      )}
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3",
          showDifferences ? "mb-5" : "mb-6",
        )}
      >
        <PeopleTabs
          view={view}
          isOwner={me.isOwner}
          canReadDifferences={canManage}
          accountCount={badge.data?.accountsWithoutPersonCount}
          differenceCount={access && access.missingCount + access.extraCount}
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
      {!showDifferences && error && !data && (
        <LoadError message={t("people.error.title")} retry={refetch} />
      )}
      {showAccounts && accounts.error && !accounts.data && (
        <LoadError message={t("people.accounts.loadFailed")} retry={accounts.refetch} />
      )}
      {!showDifferences &&
        ((!data && !error) || (showAccounts && accounts.loading && !accounts.data)) && (
          <Skeleton className="h-[300px] rounded-xl" />
        )}
      {showAccounts && accounts.data && (
        <AccountsWithoutPersonTable
          accounts={accounts.data.accountsWithoutPerson}
          loading={accounts.loading}
          refresh={refreshAccounts}
          onLinked={() =>
            void Promise.allSettled([refetch(), accounts.refill(), differences.refetch()])
          }
          onMarked={() => Promise.allSettled([accounts.refill(), marked.refresh()])}
          loadMore={() => void accounts.loadMore()}
        />
      )}
      {showAccounts && marked.error && !marked.data && (
        <LoadError message={t("people.accounts.loadFailed")} retry={marked.refetch} />
      )}
      {showAccounts && marked.data && (
        <MarkedAccountsTable
          accounts={marked.data.markedAccounts}
          loading={marked.loading}
          refresh={refreshAccounts}
          loadMore={() => void marked.loadMore()}
        />
      )}
      {showDifferences && differences.error && !access && (
        <LoadError message={t("people.differences.loadFailed")} retry={differences.refetch} />
      )}
      {showDifferences && !access && !differences.error && (
        <Skeleton className="h-[300px] rounded-xl" />
      )}
      {showDifferences && access && (
        <DifferencesPanel access={access} isOwner={me.isOwner} refresh={differences.refetch} />
      )}
      {!showAccounts && !showDifferences && people && (
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

function LoadError({ message, retry }: { message: string; retry: () => Promise<unknown> }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3">
      <p className="text-sm text-destructive">{message}</p>
      <Button type="button" variant="outline" onClick={() => void retry().catch(() => undefined)}>
        {t("people.error.retry")}
      </Button>
    </div>
  );
}
