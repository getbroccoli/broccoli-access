import { usePersonPage } from "./usePersonPage";
import { CaretLeft } from "@phosphor-icons/react";
import { Link, useNavigate, useParams, useRouteContext, useSearch } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/Avatar";
import { GoogleUserWritesNotice } from "@/components/GoogleUserWritesNotice";
import { useRefreshAfterChanges } from "@/features/apps";
import { t } from "@/i18n";
import { dayAndTime } from "@/lib/dayAndTime";
import { usePollWhileScanning } from "@/lib/usePollWhileScanning";
import { useRefetchAfterContainerConnectorScans } from "@/lib/useRefetchAfterContainerConnectorScans";

import { AddPersonAppMenu } from "./AddPersonAppMenu";
import { OffboardDialog } from "./OffboardDialog";
import { OffboardedNotice } from "./OffboardedNotice";
import { RemoveAllDialog } from "./RemoveAllDialog";
import { PersonTemplates } from "./PersonTemplates";
import { CurrentAccessTable } from "./CurrentAccessTable";
import { ProvisionBar } from "./ProvisionBar";

/**
 * A person: their status in Google, a warning while suspended with access, and their current
 * access, with the connected apps they may be invited to and Provision for the apps they miss;
 * Offboard, and afterwards what still needs the owner.
 */
export function PersonPage() {
  const { employeeId } = useParams({ from: ROUTE });
  const { offboard = false, skip, googleUserWrites } = useSearch({ from: ROUTE });
  const navigate = useNavigate({ from: "/people/$employeeId" });
  const { me } = useRouteContext({ from: "/_authenticated" });
  // The route's loader has just read the page into the cache.
  const { pageQuery, more } = usePersonPage(employeeId);
  const person = pageQuery.data?.employee;
  // A connected app's scan, such as one started from a failed change's dialog or its first one,
  // moves their rows: poll the scans only, then read the person once.
  useRefetchAfterContainerConnectorScans(pageQuery.refetch);
  // A running change or invite moves its row; the page reads the person again until each ends.
  const isChanging =
    (person?.directoryAccount?.latestChange?.status === "RUNNING" ||
      person?.appAccounts.some((account) => account.latestChange?.status === "RUNNING") ||
      person?.appInvites.some((invite) => invite.latestInvite?.status === "RUNNING")) ??
    false;
  usePollWhileScanning(isChanging, pageQuery);
  useRefreshAfterChanges(isChanging, pageQuery.refetch);
  // The route's loader found the person, so they are missing only while a reload replaces them.
  if (pageQuery.error)
    return (
      <div role="alert">
        <p>{t("people.person.refreshFailed")}</p>
        <Button variant="outline" onClick={() => void pageQuery.refetch().catch(() => undefined)}>
          {t("templates.retry")}
        </Button>
      </div>
    );
  if (!person) {
    return null;
  }
  const appCount = person.approvedAppNames.length;
  // Offboarding takes every template off; a template assigned again starts them anew.
  const offboardedAt = person.templates.edges.length ? null : person.offboarding.offboardedAt;
  const offboardedOn = offboardedAt ? dayAndTime(offboardedAt).day : null;
  // Once offboarded, Offboard comes back only when an account can be disabled again.
  const canOffboard = !offboardedAt || person.offboarding.accountsToDisable.length > 0;
  // Some of the apps they still have access to can be disabled from here.
  const canDisableHere = person.appAccounts.some(
    ({ offeredChange }) => offeredChange === "SUSPEND",
  );

  return (
    <div className="flex flex-col gap-5">
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
            {person.status === "ACTIVE" && (
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-deep">
                {t("people.status.active")}
              </span>
            )}
            {person.status === "SUSPENDED" && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                {t("people.person.suspendedInGoogle")}
              </span>
            )}
            {offboardedAt && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground/70">
                {offboardedOn
                  ? t("people.offboard.offboardedOn", { day: offboardedOn })
                  : t("people.offboard.offboardedToday")}
              </span>
            )}
          </div>
          <span className="truncate text-sm text-muted-foreground">{person.email}</span>
        </div>
        {canOffboard && (
          <Button
            type="button"
            variant="outline"
            className="ml-auto shrink-0"
            onClick={() => void navigate({ search: { offboard: true } })}
          >
            {t("people.offboard.button")}
          </Button>
        )}
      </div>
      {/* Mounted while open, so each offboarding starts from every app ticked. */}
      {offboard && (
        <OffboardDialog
          person={person}
          googleUserWrites={googleUserWrites}
          initialSkippedAppIds={skip?.split("_") ?? []}
          onClose={() => void navigate({ search: {} })}
        />
      )}
      {!offboard && googleUserWrites && <GoogleUserWritesNotice outcome={googleUserWrites} />}
      {offboardedAt && <OffboardedNotice person={person} />}
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
      <PersonTemplates
        person={{ ...person, templates: person.templates.edges.map((edge) => edge.node) }}
      />
      {person.templates.pageInfo.hasNextPage && (
        <Button variant="link" disabled={pageQuery.loading} onClick={() => more("templates")}>
          {t("people.person.moreTemplates")}
        </Button>
      )}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{t("templates.apps.title")}</h2>
          {me.isOwner && person.status === "ACTIVE" && <AddPersonAppMenu employeeId={person.id} />}
          {offboardedAt && person.offboarding.accountsToRemove.length > 0 && (
            <RemoveAllDialog person={person} />
          )}
        </div>
        <CurrentAccessTable person={person} />
        {person.personApps.pageInfo.hasNextPage && (
          <Button variant="link" disabled={pageQuery.loading} onClick={() => more("personApps")}>
            {t("people.person.moreApps")}
          </Button>
        )}
        <ProvisionBar person={person} />
      </section>
    </div>
  );
}

const ROUTE = "/_authenticated/people_/$employeeId";
