import type { AppPageQuery } from "@/__generated__/graphql";
import type { DataTableColumn } from "@/components/dataTable";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";
import { formatSince } from "@/lib/since";

import { describeFoundVia } from "../foundVia";
import { PersonCell } from "./PersonCell";

type AppUserRow = NonNullable<AppPageQuery["app"]>["users"][number];

/** An app's users: who, their status in Google, how each account was found and since when. */
export const USER_COLUMNS: DataTableColumn<AppUserRow>[] = [
  {
    id: "person",
    header: t("apps.page.column.person"),
    className: "w-[38%] min-w-56",
    cell: ({ employee }) => <PersonCell employee={employee} />,
  },
  {
    id: "status",
    header: t("apps.page.column.status"),
    className: "w-[20%]",
    cell: ({ suspendedInDirectory }) => (
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
          suspendedInDirectory ? "bg-amber-100 text-amber-900" : "bg-brand-soft text-brand-deep",
        )}
      >
        {t(suspendedInDirectory ? "apps.page.status.suspended" : "apps.page.status.active")}
      </span>
    ),
  },
  {
    id: "foundVia",
    header: t("apps.column.foundVia"),
    className: "w-[18%]",
    cell: ({ foundVia }) => describeFoundVia(foundVia),
  },
  {
    id: "since",
    header: t("apps.column.since"),
    cell: ({ since }) => formatSince(since),
  },
];
