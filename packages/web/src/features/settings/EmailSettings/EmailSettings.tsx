import { useQuery } from "@apollo/client/react";

import { EmailSettingsDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { PageHeader } from "@/shell";

import { EmailForm } from "./EmailForm";

/** Settings' Email page: how the instance sends email. */
export function EmailSettings() {
  const { data, error, refetch } = useQuery(EmailSettingsDocument);

  return (
    <div className="flex max-w-2xl flex-col">
      <PageHeader title={t("settings.email.title")} description={t("settings.email.description")} />
      {data?.setup.mail ? (
        <EmailForm mail={data.setup.mail} />
      ) : error ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">{t("settings.email.loadFailed")}</p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            {t("settings.email.retry")}
          </Button>
        </div>
      ) : (
        <Skeleton className="h-[240px] rounded-xl" />
      )}
    </div>
  );
}
