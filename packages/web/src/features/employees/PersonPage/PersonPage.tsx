import { useQuery } from "@apollo/client/react";
import { CaretLeft } from "@phosphor-icons/react";
import { Link, useParams } from "@tanstack/react-router";

import { PersonPageDocument } from "@/__generated__/graphql";
import { Avatar } from "@/components/Avatar";
import { useRefreshAfterChanges } from "@/features/apps";
import { t } from "@/i18n";
import { usePollWhileScanning } from "@/lib/usePollWhileScanning";
import { useRefetchAfterContainerConnectorScans } from "@/lib/useRefetchAfterContainerConnectorScans";

import { CurrentAccessTable } from "./CurrentAccessTable";

/** A person: their status in Google, a warning while suspended with access, and their current access. */
export function PersonPage() {
  const { employeeId } = useParams({ from: "/_authenticated/people_/$employeeId" });
  // The route's loader has just read the page into the cache.
  const pageQuery = useQuery(PersonPageDocument, { variables: { id: employeeId } });
  const person = pageQuery.data?.employee;
  // A connected app's scan, such as one started from a failed change's dialog or its first one,
  // moves their rows: poll the scans only, then read the person once.
  useRefetchAfterContainerConnectorScans(pageQuery.refetch);
  // A running change moves its row; the page reads the person again until every change ends.
  const isChanging =
    person?.appAccounts.some((account) => account.latestChange?.status === "RUNNING") ?? false;
  usePollWhileScanning(isChanging, pageQuery);
  useRefreshAfterChanges(isChanging, pageQuery.refetch);
  // The route's loader found the person, so they are missing only while a reload replaces them.
  if (!person) {
    return null;
  }
  const appCount = person.approvedAppNames.length;
  // Some of the apps they still have access to can be disabled from here.
  const canDisableHere = person.appAccounts.some(
    ({ status, app }) => status === "ACTIVE" && app.canChangeAccounts,
  );

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/people"
        className="flex w-fit items-center gap-1.5 text-sm text-foreground/80 transition-colors hover:text-foreground"
      >
        <CaretLeft size={14} weight="bold" />
        {t("people.title")}
      </Link>
      <div className="flex min-w-0 items-center gap-4">
        <Avatar
          url={person.avatarUrl ?? null}
          firstName={person.firstName}
          lastName={person.lastName}
          className="size-14 text-lg"
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {person.firstName} {person.lastName}
            </h1>
            {person.status === "SUSPENDED" && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                {t("people.person.suspendedInGoogle")}
              </span>
            )}
          </div>
          <span className="truncate text-sm text-muted-foreground">{person.email}</span>
        </div>
      </div>
      {person.suspendedWithAccess && (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900"
        >
          {appCount === 1
            ? t("people.person.suspendedWithAccessOne", { name: person.firstName })
            : t("people.person.suspendedWithAccess", {
                name: person.firstName,
                count: String(appCount),
              })}
          {canDisableHere &&
            ` ${t(appCount === 1 ? "people.person.disableWhereConnectedOne" : "people.person.disableWhereConnected")}`}
        </p>
      )}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{t("people.person.currentAccess")}</h2>
        <CurrentAccessTable appAccounts={person.appAccounts} />
      </section>
    </div>
  );
}
