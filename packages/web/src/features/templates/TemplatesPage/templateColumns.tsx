import { Link } from "@tanstack/react-router";

import type { TemplatesPageQuery } from "@/__generated__/graphql";
import type { DataTableColumn } from "@/components/dataTable";
import { StatusBadge } from "@/features/apps";
import { t } from "@/i18n";

type TemplateRow = TemplatesPageQuery["templates"]["edges"][number]["node"];

const TEMPLATE: DataTableColumn<TemplateRow> = {
  id: "template",
  header: t("templates.column.template"),
  className: "w-40",
  cell: ({ id, name }) => (
    <Link
      to="/templates/$templateId"
      params={{ templateId: id }}
      className="font-semibold hover:text-brand-deep"
    >
      {name}
    </Link>
  ),
};

const APPS: DataTableColumn<TemplateRow> = {
  id: "apps",
  header: t("templates.column.apps"),
  className: "text-foreground/80",
  cell: ({ apps }) =>
    apps.length > 0 ? apps.map(({ app }) => app.name).join(", ") : t("templates.noApps"),
};

const PEOPLE: DataTableColumn<TemplateRow> = {
  id: "people",
  header: t("templates.column.people"),
  className: "w-32 text-foreground/80 tabular-nums",
  cell: ({ peopleCount }) => peopleCount,
};

const DIFFERENCES: DataTableColumn<TemplateRow> = {
  id: "differences",
  header: t("templates.column.differences"),
  className: "w-60",
  cell: ({ differenceSummary }) =>
    differenceSummary ? (
      <Link to="/people" search={{ view: "differences" }}>
        <StatusBadge tone="warning">{differenceLabel(differenceSummary)}</StatusBadge>
      </Link>
    ) : (
      <span className="text-muted-foreground">{t("templates.noDifferences")}</span>
    ),
};

/** The apps, people and differences of each template. */
export const TEMPLATE_COLUMNS = [TEMPLATE, APPS, PEOPLE, DIFFERENCES];

function differenceLabel({
  missingCount,
  extraCount,
  missingApp,
}: NonNullable<TemplateRow["differenceSummary"]>) {
  if (missingCount && extraCount)
    return t("templates.differences.total", { count: String(missingCount + extraCount) });
  if (missingApp)
    return t("templates.differences.missingApp", {
      count: String(missingCount),
      app: missingApp.name,
    });
  return missingCount
    ? t("templates.differences.missing", { count: String(missingCount) })
    : t("templates.differences.extra", { count: String(extraCount) });
}
