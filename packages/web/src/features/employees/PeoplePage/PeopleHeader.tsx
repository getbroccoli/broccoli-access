import { ScanNowDocument, type PeoplePageQuery } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { formatLastScan } from "@/lib/lastScan";
import { PageHeader } from "@/shell";

type Props = {
  /** The Google Workspace connection; null without one, undefined while it loads. */
  connection: PeoplePageQuery["setup"]["googleWorkspace"] | undefined;
  /** Whether the page has its data, so the description waits for the last scan. */
  loaded: boolean;
};

/** The page's title with when Google Workspace was last scanned, and "Scan now". */
export function PeopleHeader({ connection, loaded }: Props) {
  const [scanNow, { loading, error }] = usePayloadMutation(ScanNowDocument);
  const scan = connection?.scan;
  const isScanning = scan?.status === "SCANNING";
  // The header shows the last scan without its full stop, as one line with the description.
  const lastScan = isScanning
    ? t("scans.scanning")
    : formatLastScan(scan?.readAt ?? null).replace(/\.$/, "");

  return (
    <div className="flex items-start justify-between gap-4">
      <PageHeader
        title={t("people.title")}
        description={loaded ? `${t("people.description")} ${lastScan}` : undefined}
      />
      {connection && (
        <div className="flex shrink-0 flex-col items-end gap-1">
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
