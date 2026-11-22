import { type AppsPageQuery, ScanNowDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { formatLastScan } from "@/lib/lastScan";
import { PageHeader } from "@/shell";

type Props = {
  /** The Google Workspace connection with its scan; undefined while it loads. */
  connection: AppsPageQuery["setup"]["googleWorkspace"] | undefined;
  /** Scan now waits until setup is done: setup's own scan just ran. */
  canScan: boolean;
};

/** The page's title with when the last scan ran, and Scan now. */
export function AppsHeader({ connection, canScan }: Props) {
  const [scanNow, { loading, error }] = usePayloadMutation(ScanNowDocument);
  const isScanning = connection?.scan?.status === "SCANNING";

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4">
      <PageHeader
        title={t("apps.title")}
        description={connection && (isScanning ? t("scans.scanning") : lastScan(connection))}
      />
      {canScan && connection && (
        <div className="flex flex-col items-end gap-2 pb-6">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="px-4"
            disabled={isScanning || loading}
            // `usePayloadMutation` keeps a failure for display, so the rejection needs no handling here.
            onClick={() =>
              void scanNow({ variables: { connectionId: connection.id } }).catch(() => undefined)
            }
          >
            {t("scans.scanNow")}
          </Button>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {t("scans.scanNowFailed")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** "Scanned today at 08:00": page headers show the last scan without the full stop. */
function lastScan(connection: NonNullable<Props["connection"]>): string {
  return formatLastScan(connection.scan?.readAt ?? null).replace(/\.$/, "");
}
