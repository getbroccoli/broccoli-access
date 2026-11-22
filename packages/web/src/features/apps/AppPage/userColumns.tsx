import type { AppPageQuery } from "@/__generated__/graphql";
import type { DataTableColumn } from "@/components/dataTable";
import { t } from "@/i18n";
import { FoundVia } from "@/components/FoundVia";
import { formatSince } from "@/lib/since";

import { PersonCell } from "./PersonCell";
import { StatusBadge } from "./StatusBadge";

type AppUserRow = NonNullable<AppPageQuery["app"]>["users"][number];

/**
 * An app's users: who, their status in Google, their status in the app when it is connected
 * through the connectors container, how each account was found and since when.
 */
export function userColumns(
  connectedApp: { name: string; findingKind: string } | null,
): DataTableColumn<AppUserRow>[] {
  return connectedApp
    ? [PERSON, STATUS, inAppColumn(connectedApp), FOUND_VIA, SINCE]
    : [PERSON, STATUS, FOUND_VIA, SINCE];
}

const PERSON: DataTableColumn<AppUserRow> = {
  id: "person",
  header: t("apps.page.column.person"),
  className: "w-[38%] min-w-56",
  cell: ({ employee }) => <PersonCell employee={employee} />,
};

const STATUS: DataTableColumn<AppUserRow> = {
  id: "status",
  header: t("apps.page.column.status"),
  className: "w-[20%]",
  cell: ({ employee }) => {
    const suspended = employee.status === "SUSPENDED";
    return (
      <StatusBadge tone={suspended ? "warning" : "active"}>
        {t(suspended ? "apps.page.status.suspended" : "apps.page.status.active")}
      </StatusBadge>
    );
  },
};

const FOUND_VIA: DataTableColumn<AppUserRow> = {
  id: "foundVia",
  header: t("apps.column.foundVia"),
  className: "w-[18%]",
  cell: ({ foundVia }) => <FoundVia findingKinds={foundVia} />,
};

const SINCE: DataTableColumn<AppUserRow> = {
  id: "since",
  header: t("apps.column.since"),
  cell: ({ since }) => formatSince(since),
};

/**
 * The account's status in the connected app, as its own scan read it; a suspended one shows as
 * Disabled, as in the app. An account only another source found was not read there.
 */
function inAppColumn({
  name,
  findingKind,
}: {
  name: string;
  findingKind: string;
}): DataTableColumn<AppUserRow> {
  return {
    id: "inApp",
    header: t("apps.page.column.inApp", { app: name }),
    className: "w-[12%]",
    cell: ({ status, foundVia }) => {
      if (!foundVia.includes(findingKind)) {
        return (
          <span className="text-sm text-muted-foreground">{t("apps.page.inApp.notListed")}</span>
        );
      }
      return (
        <StatusBadge tone={status === "SUSPENDED" ? "muted" : "active"}>
          {t(status === "SUSPENDED" ? "apps.page.inApp.disabled" : "apps.page.inApp.active")}
        </StatusBadge>
      );
    },
  };
}
