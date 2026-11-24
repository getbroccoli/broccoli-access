import type { TemplatePageQuery } from "@/__generated__/graphql";
import { AppMark } from "@/components/AppMark";
import type { DataTableColumn } from "@/components/dataTable";
import { Button } from "@/components/ui/button";
import { AppTable, StatusBadge } from "@/features/apps";
import { t } from "@/i18n";

type TemplateAppRow = NonNullable<TemplatePageQuery["template"]>["apps"][number];

type Props = {
  apps: readonly TemplateAppRow[];
  /** While another change of the template's apps runs. */
  disabled: boolean;
  onSetRole: (app: TemplateAppRow["app"], role: string) => void;
  onTakeOut: (app: TemplateAppRow["app"]) => void;
};

/** How many apps show before "Show n more": more than a template usually lists. */
const FIRST_APPS = 50;

/** A template's apps in the order added, each with "Take out". */
export function TemplateAppsTable({ apps, disabled, onTakeOut, onSetRole }: Props) {
  const columns: DataTableColumn<TemplateAppRow>[] = [
    {
      id: "app",
      header: t("templates.column.app"),
      cell: ({ app }) => (
        <span className="flex items-center gap-2.5 font-semibold">
          <AppMark name={app.name} catalogKey={app.catalogKey ?? null} className="size-7" />
          {app.name}
        </span>
      ),
    },
    {
      id: "role",
      header: t("people.person.role"),
      cell: ({ app, role }) =>
        app.roles.length ? (
          <select
            aria-label={t("templates.role.label", { app: app.name })}
            className="h-8 max-w-full rounded-lg border border-input bg-background px-2 text-sm"
            disabled={disabled}
            value={role ?? app.roles.find((option) => option.isDefault)?.key}
            onChange={(event) => onSetRole(app, event.target.value)}
          >
            {role !== null && !app.roles.some((option) => option.key === role) && (
              <option disabled value={role}>
                {role}
              </option>
            )}
            {app.roles.map((option) => (
              <option key={option.key} value={option.key}>
                {option.name}
              </option>
            ))}
          </select>
        ) : app.connected ? (
          t("templates.role.default")
        ) : (
          <StatusBadge tone="warning">{t("apps.activity.byHand")}</StatusBadge>
        ),
    },
    {
      id: "actions",
      header: <span className="sr-only">{t("templates.column.actions")}</span>,
      className: "text-right",
      cell: ({ app }) => (
        <Button
          type="button"
          variant="outline"
          className="px-3"
          disabled={disabled}
          aria-label={t("templates.takeOutApp", { app: app.name })}
          onClick={() => onTakeOut(app)}
        >
          {t("templates.takeOut")}
        </Button>
      ),
    },
  ];

  return (
    <AppTable
      rows={apps}
      columns={columns}
      firstRows={FIRST_APPS}
      showMoreLabel={(count) => t("templates.showMore", { count: String(count) })}
      emptyState={t("templates.apps.empty")}
    />
  );
}
