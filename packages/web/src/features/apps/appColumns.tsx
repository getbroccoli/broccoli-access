import type { DataTableColumn } from "@/components/dataTable";
import { type MessageKey, t } from "@/i18n";
import { formatSince } from "@/lib/since";

import { AppNameCell, type AppRow } from "./AppTable";

/** The columns of a list of found apps: who uses each, how it was found and since when. */
export const FOUND_APP_COLUMNS: DataTableColumn<AppRow>[] = [
  {
    id: "app",
    header: t("apps.column.app"),
    className: "w-[34%] min-w-48",
    cell: ({ name, domain }) => <AppNameCell name={name} domain={domain} />,
  },
  {
    id: "people",
    header: t("apps.column.people"),
    className: "w-[13%] tabular-nums",
    cell: ({ peopleCount }) => peopleCount,
  },
  {
    id: "foundVia",
    header: t("apps.column.foundVia"),
    className: "w-[22%]",
    cell: ({ foundVia }) => foundVia.map(foundViaLabel).join(", "),
  },
  {
    id: "since",
    header: t("apps.column.since"),
    cell: ({ since }) => since && formatSince(since),
  },
];

/** The finding kinds the connector modules register, as people read them. */
const FOUND_VIA_LABELS: Record<string, MessageKey> = {
  google_directory: "apps.foundVia.google_directory",
  google_sign_in: "apps.foundVia.google_sign_in",
};

function foundViaLabel(findingKind: string): string {
  const label = FOUND_VIA_LABELS[findingKind];
  return label ? t(label) : findingKind;
}
