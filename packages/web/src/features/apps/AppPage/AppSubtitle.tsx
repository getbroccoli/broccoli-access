import type { AppPageQuery } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { formatLastScan } from "@/lib/lastScan";

type Props = {
  app: Pick<NonNullable<AppPageQuery["app"]>, "domain" | "containerConnection">;
};

/** The app's domain, then for an app connected through the container its workspace and last scan. */
export function AppSubtitle({ app }: Props) {
  const scan = app.containerConnection?.scan;
  if (!scan) {
    return app.domain && <span className="text-sm text-muted-foreground">{app.domain}</span>;
  }
  const lastScan = describeLastScan(scan);
  const workspace = scan.sourceName;
  return (
    <span className="text-sm text-muted-foreground">
      {app.domain
        ? t("apps.page.connectedSubtitle", { domain: app.domain, workspace, lastScan })
        : t("apps.page.connectedSubtitleWithoutDomain", { workspace, lastScan })}
    </span>
  );
}

type Scan = NonNullable<NonNullable<Props["app"]["containerConnection"]>["scan"]>;

/** "Scanning…", or the last successful scan, and whether the latest one failed. */
function describeLastScan({ status, readAt }: Scan): string {
  if (status === "SCANNING") {
    return t("scans.scanning");
  }
  const scanned = formatLastScan(readAt);
  return status === "SCAN_FAILED" ? `${scanned} ${t("apps.page.lastScanFailed")}` : scanned;
}
