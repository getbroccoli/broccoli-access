import { Link } from "@tanstack/react-router";

import type { DataTableColumn } from "@/components/dataTable";
import { t } from "@/i18n";
import { FoundVia } from "@/components/FoundVia";
import { formatSince } from "@/lib/since";

import { AppRowActions } from "./AppRowActions";
import {
  AppNameCell,
  AppPeopleCell,
  type AppRow,
  type ApprovedAppRow,
  isAppToConnect,
  isConnected,
} from "./AppTable";
import { ConnectAppButton } from "./ConnectAppButton";
import { ConnectedBadge } from "./ConnectedBadge";

const APP_COLUMN: DataTableColumn<ApprovedAppRow> = {
  id: "app",
  header: t("apps.column.app"),
  className: "w-[34%] min-w-48",
  cell: (row) =>
    isAppToConnect(row) ? (
      // An app to connect has no page until connecting adds it; its id is its catalog key.
      <AppNameCell name={row.name} domain={row.domain} catalogKey={row.id} />
    ) : (
      <Link
        to="/apps/$appId"
        params={{ appId: row.id }}
        className="block rounded-md hover:opacity-80"
      >
        <AppNameCell name={row.name} domain={row.domain} catalogKey={row.catalogKey} />
      </Link>
    ),
};

const FOUND_VIA_COLUMN: DataTableColumn<AppRow> = {
  id: "foundVia",
  header: t("apps.column.foundVia"),
  className: "w-[22%]",
  cell: ({ foundVia }) => <FoundVia findingKinds={foundVia} />,
};

/**
 * The columns of the approved apps: who uses each, how they were found, who keeps access though
 * suspended, and Connect or Connected for an app a connector can manage.
 */
export const APPROVED_APP_COLUMNS: DataTableColumn<ApprovedAppRow>[] = [
  APP_COLUMN,
  emptyForAppsToConnect({
    id: "users",
    header: t("apps.column.users"),
    className: "w-[14%]",
    cell: ({ users, peopleCount }) => <AppPeopleCell users={users} peopleCount={peopleCount} />,
  }),
  emptyForAppsToConnect(FOUND_VIA_COLUMN),
  emptyForAppsToConnect({
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
  }),
  {
    id: "connection",
    header: t("apps.column.connection"),
    className: "w-28 text-right",
    cell: (row) => {
      const connector = isAppToConnect(row) ? row.connector : row.managingConnector;
      if (!connector) {
        return null;
      }
      // A cached app to connect may already be connected elsewhere until the list reloads.
      const connected = isAppToConnect(row) ? Boolean(connector.connection) : isConnected(row);
      return connected ? (
        <ConnectedBadge />
      ) : (
        <ConnectAppButton connector={connector} size="default" />
      );
    },
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

/** The column with an empty cell for an app to connect, which has no users or findings yet. */
function emptyForAppsToConnect(column: DataTableColumn<AppRow>): DataTableColumn<ApprovedAppRow> {
  return { ...column, cell: (row) => (isAppToConnect(row) ? null : column.cell(row)) };
}
