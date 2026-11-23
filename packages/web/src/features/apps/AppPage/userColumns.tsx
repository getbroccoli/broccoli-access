import type { AppPageQuery } from "@/__generated__/graphql";
import type { DataTableColumn } from "@/components/dataTable";
import { t } from "@/i18n";
import { FoundVia } from "@/components/FoundVia";
import { formatSince } from "@/lib/since";

import { AccountChangeCell } from "../AccountChangeCell";
import { AppAccountStatusCell } from "./AppAccountStatusCell";
import { PersonCell } from "./PersonCell";
import { StatusBadge } from "./StatusBadge";

type AppUserRow = NonNullable<AppPageQuery["app"]>["users"][number];

/**
 * An app's users: who, their status in Google, their status in the app when it is connected
 * through the connectors container, how each account was found and since when, and Disable or
 * Enable where its connection can change accounts.
 */
export function userColumns(
  connectedApp: { name: string; findingKind: string; canChangeAccounts: boolean } | null,
): DataTableColumn<AppUserRow>[] {
  if (!connectedApp) {
    return [PERSON, STATUS, FOUND_VIA, SINCE];
  }
  const columns = [PERSON, STATUS, inAppColumn(connectedApp), FOUND_VIA, SINCE];
  return connectedApp.canChangeAccounts ? [...columns, ACTIONS] : columns;
}

const PERSON: DataTableColumn<AppUserRow> = {
  id: "person",
  header: t("apps.page.column.person"),
  className: "w-[38%] min-w-56",
  cell: ({ employee, isConnectionUser }) => (
    <PersonCell employee={employee} isConnectionUser={isConnectionUser} />
  ),
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

const ACTIONS: DataTableColumn<AppUserRow> = {
  id: "actions",
  header: <span className="sr-only">{t("apps.page.column.actions")}</span>,
  className: "text-right",
  cell: (user) => <AccountChangeCell appUser={user} />,
};

const SINCE: DataTableColumn<AppUserRow> = {
  id: "since",
  header: t("apps.column.since"),
  cell: ({ since }) => formatSince(since),
};

/**
 * The account's status in the connected app, as its own scan read it; a suspended one shows as
 * Disabled, as in the app, and a failed change as "Couldn't disable". An account only another
 * source found was not read there.
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
    cell: (user) => {
      if (!user.foundVia.includes(findingKind)) {
        return (
          <span className="text-sm text-muted-foreground">{t("apps.page.inApp.notListed")}</span>
        );
      }
      return <AppAccountStatusCell appUser={user} />;
    },
  };
}
