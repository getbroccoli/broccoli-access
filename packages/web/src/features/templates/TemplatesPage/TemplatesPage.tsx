import { useQuery } from "@apollo/client/react";

import { TemplatesPageDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppTable, useRefreshDifferences } from "@/features/apps";
import { t } from "@/i18n";
import { PageHeader } from "@/shell";

import { NewTemplateButton } from "./NewTemplateButton";
import { TEMPLATE_COLUMNS } from "./templateColumns";

/** How many templates show before "Show n more": more than a company's roles usually need. */
const FIRST_TEMPLATES = 50;

/** Templates: the named lists of apps, each with its apps and how many people have it. */
export function TemplatesPage() {
  // A new or renamed template takes a place only the server knows, so each visit reads afresh.
  const { data, error, refetch } = useQuery(TemplatesPageDocument, {
    fetchPolicy: "cache-and-network",
  });
  const templates = data?.templates.edges.map(({ node }) => node);
  useRefreshDifferences(data?.accessDifferences.runningChangeIds ?? [], refetch);

  return (
    <div className="flex flex-col">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title={t("templates.title")} />
        <NewTemplateButton />
      </div>
      {error && !data && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">{t("templates.error")}</p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            {t("templates.retry")}
          </Button>
        </div>
      )}
      {!data && !error && <Skeleton className="h-[300px] rounded-xl" />}
      {templates && (
        <AppTable
          rows={templates}
          columns={TEMPLATE_COLUMNS}
          firstRows={FIRST_TEMPLATES}
          showMoreLabel={(count) => t("templates.showMore", { count: String(count) })}
          emptyState={t("templates.empty")}
        />
      )}
    </div>
  );
}
