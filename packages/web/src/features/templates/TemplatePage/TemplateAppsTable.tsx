import { toast } from "sonner";

import { type TemplatePageQuery, TakeOutTemplateAppDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { AppMark } from "@/components/AppMark";
import type { DataTableColumn } from "@/components/dataTable";
import { Button } from "@/components/ui/button";
import { AppTable } from "@/features/apps";
import { t } from "@/i18n";

type TemplateAppRow = NonNullable<TemplatePageQuery["template"]>["apps"][number];

type Props = {
  templateId: string;
  apps: readonly TemplateAppRow[];
};

/** How many apps show before "Show n more": more than a template usually lists. */
const FIRST_APPS = 50;

/** A template's apps in the order added, each with "Take out". */
export function TemplateAppsTable({ templateId, apps }: Props) {
  // The payload carries the template's apps, so the row leaves.
  const [takeOutApp, { loading }] = usePayloadMutation(TakeOutTemplateAppDocument);
  const takeOut = ({ id, name }: TemplateAppRow["app"]) =>
    takeOutApp({ variables: { input: { id: templateId, appId: id } } }).catch(() =>
      toast.error(t("templates.takeOutFailed", { app: name })),
    );
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
      id: "actions",
      header: <span className="sr-only">{t("templates.column.actions")}</span>,
      className: "text-right",
      cell: ({ app }) => (
        <Button
          type="button"
          variant="outline"
          className="px-3"
          disabled={loading}
          aria-label={t("templates.takeOutApp", { app: app.name })}
          onClick={() => void takeOut(app)}
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
