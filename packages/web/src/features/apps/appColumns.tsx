import { Link } from "@tanstack/react-router";

import type { DataTableColumn } from "@/components/dataTable";
import { t } from "@/i18n";
import { describeFoundVia } from "@/lib/foundVia";
import { formatSince } from "@/lib/since";

import { AppStatusActions } from "./AppStatusActions";
import { AppNameCell, type AppRow } from "./AppTable";

const APP_COLUMN: DataTableColumn<AppRow> = {
  id: "app",
  header: t("apps.column.app"),
  className: "w-[34%] min-w-48",
  cell: ({ id, name, domain }) => (
    <Link to="/apps/$appId" params={{ appId: id }} className="block rounded-md hover:opacity-80">
      <AppNameCell name={name} domain={domain} />
    </Link>
  ),
};

const FOUND_VIA_COLUMN: DataTableColumn<AppRow> = {
  id: "foundVia",
  header: t("apps.column.foundVia"),
  className: "w-[22%]",
  cell: ({ foundVia }) => describeFoundVia(foundVia),
};

/** The columns of the approved apps: who uses each, how they were found, and who keeps access though suspended. */
export const APPROVED_APP_COLUMNS: DataTableColumn<AppRow>[] = [
  APP_COLUMN,
  {
    id: "users",
    header: t("apps.column.users"),
    className: "w-[11%] tabular-nums",
    cell: ({ peopleCount }) => peopleCount,
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
    className: "w-[13%] tabular-nums",
    cell: ({ peopleCount }) => peopleCount,
  },
  FOUND_VIA_COLUMN,
  {
    id: "since",
    header: t("apps.column.since"),
    cell: ({ since }) => since && formatSince(since),
  },
];

/** Approve and Ignore at the end of each row, as the app's status allows. */
export const APP_ACTIONS_COLUMN: DataTableColumn<AppRow> = {
  id: "actions",
  header: "",
  className: "w-44",
  cell: (app) => <AppStatusActions app={app} />,
};
