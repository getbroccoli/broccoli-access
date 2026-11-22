import { Link } from "@tanstack/react-router";

import type { DataTableColumn } from "@/components/dataTable";
import { t } from "@/i18n";
import { FoundVia } from "@/components/FoundVia";
import { formatSince } from "@/lib/since";

import { AppRowActions } from "./AppRowActions";
import { AppNameCell, AppPeopleCell, type AppRow } from "./AppTable";

const APP_COLUMN: DataTableColumn<AppRow> = {
  id: "app",
  header: t("apps.column.app"),
  className: "w-[34%] min-w-48",
  cell: ({ id, name, domain, catalogKey }) => (
    <Link to="/apps/$appId" params={{ appId: id }} className="block rounded-md hover:opacity-80">
      <AppNameCell name={name} domain={domain} catalogKey={catalogKey} />
    </Link>
  ),
};

const FOUND_VIA_COLUMN: DataTableColumn<AppRow> = {
  id: "foundVia",
  header: t("apps.column.foundVia"),
  className: "w-[22%]",
  cell: ({ foundVia }) => <FoundVia findingKinds={foundVia} />,
};

/** The columns of the approved apps: who uses each, how they were found, and who keeps access though suspended. */
export const APPROVED_APP_COLUMNS: DataTableColumn<AppRow>[] = [
  APP_COLUMN,
  {
    id: "users",
    header: t("apps.column.users"),
    className: "w-[16%]",
    cell: ({ users, peopleCount }) => <AppPeopleCell users={users} peopleCount={peopleCount} />,
  },
  FOUND_VIA_COLUMN,
  {
    id: "suspendedInGoogle",
    header: t("apps.column.suspendedInGoogle"),
    cell: ({ suspendedWithAccessCount }) =>
      suspendedWithAccessCount > 0 && (
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
          {suspendedWithAccessCount === 1
            ? t("apps.stillHasAccess")
            : t("apps.stillHaveAccess", { count: String(suspendedWithAccessCount) })}
        </span>
      ),
  },
];

/** The columns of a list of found apps: who uses each, how it was found and since when. */
export const FOUND_APP_COLUMNS: DataTableColumn<AppRow>[] = [
  APP_COLUMN,
  {
    id: "people",
    header: t("apps.column.people"),
    className: "w-[16%]",
    cell: ({ users, peopleCount }) => <AppPeopleCell users={users} peopleCount={peopleCount} />,
  },
  FOUND_VIA_COLUMN,
  {
    id: "since",
    header: t("apps.column.since"),
    cell: ({ since }) => since && formatSince(since),
  },
];

/** Approve at the end of each row of an app not approved yet; Ignore is on the app's page. */
export const APP_ACTIONS_COLUMN: DataTableColumn<AppRow> = {
  id: "actions",
  header: "",
  className: "w-28 text-right",
  cell: (app) => <AppRowActions app={app} />,
};
