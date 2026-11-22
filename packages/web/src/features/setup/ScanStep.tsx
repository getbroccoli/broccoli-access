import { useQuery } from "@apollo/client/react";

import { SetupScanDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t, type MessageKey } from "@/i18n";

import { SetupLayout } from "./SetupLayout";

/** What the scan reads, in order; each waits until the scan runs. */
const SCAN_PARTS: { title: MessageKey; hint: MessageKey }[] = [
  { title: "setup.scan.readingPeople", hint: "setup.scan.readingPeopleHint" },
  { title: "setup.scan.findingApps", hint: "setup.scan.waiting" },
  { title: "setup.scan.readingLogs", hint: "setup.scan.waiting" },
];

/** Setup's second step, where the owner lands after connecting Google: the scan of their workspace. */
export function ScanStep() {
  const { data, error, refetch } = useQuery(SetupScanDocument);
  const connection = data?.setup.googleWorkspace;
  return (
    <SetupLayout
      step="scan"
      title={
        connection ? t("setup.scan.heading", { domain: connection.domain }) : t("setup.scan.title")
      }
      description={
        connection ? t("setup.scan.description", { email: connection.adminEmail }) : undefined
      }
    >
      {error && !connection ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">{t("setup.scan.loadFailed")}</p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            {t("setup.connect.retry")}
          </Button>
        </div>
      ) : (
        <ol className="max-w-[720px] divide-y divide-border rounded-xl border border-border">
          {SCAN_PARTS.map(({ title, hint }) => (
            <li key={title} className="flex items-center gap-5 px-6 py-5">
              <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-border" />
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-medium text-foreground/70">{t(title)}</span>
                <span className="text-sm text-muted-foreground">{t(hint)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </SetupLayout>
  );
}
