import { createFileRoute } from "@tanstack/react-router";

import { AppsPage, appsSearch } from "@/features/apps";
import { t } from "@/i18n";
import { PageHeader } from "@/shell";

/** Applications: the company's apps by status, and setup's last step while it selects them. */
export const Route = createFileRoute("/_authenticated/apps")({
  validateSearch: appsSearch,
  component: () => (
    <>
      <PageHeader title={t("apps.title")} />
      <AppsPage />
    </>
  ),
});
