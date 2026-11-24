import { Link } from "@tanstack/react-router";

import type { TemplatesPageQuery } from "@/__generated__/graphql";
import type { DataTableColumn } from "@/components/dataTable";
import { t } from "@/i18n";

type TemplateRow = TemplatesPageQuery["templates"]["edges"][number]["node"];

const TEMPLATE: DataTableColumn<TemplateRow> = {
  id: "template",
  header: t("templates.column.template"),
  className: "w-48",
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
  className: "w-56 text-foreground/80 tabular-nums",
  cell: ({ peopleCount }) => peopleCount,
};

/** A template's name, its apps in the order added, and how many people have it. */
export const TEMPLATE_COLUMNS = [TEMPLATE, APPS, PEOPLE];
