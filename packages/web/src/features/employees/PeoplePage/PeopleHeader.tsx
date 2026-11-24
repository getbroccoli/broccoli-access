import type { PeoplePageQuery } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { formatLastScan } from "@/lib/lastScan";
import { PageHeader } from "@/shell";
import { ScanNowButton } from "@/components/ScanNowButton";

type Props = {
  /** The Google Workspace connection; null without one, undefined while it loads. */
  connection: PeoplePageQuery["setup"]["googleWorkspace"] | undefined;
  /** Whether the page has its data, so the description waits for the last scan. */
  loaded: boolean;
};

/** The page's title with when Google Workspace was last scanned, and "Scan now". */
export function PeopleHeader({ connection, loaded }: Props) {
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
      {connection && <ScanNowButton connectionId={connection.id} isScanning={isScanning} />}
    </div>
  );
}
