import { useQuery } from "@apollo/client/react";
import { useEffect, useRef } from "react";

import { AppsScanDocument, type AppsScanQuery, ScanNowDocument } from "@/__generated__/graphql";
import { useCache, usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { formatLastScan } from "@/lib/lastScan";
import { usePollWhileScanning } from "@/lib/usePollWhileScanning";
import { PageHeader } from "@/shell";

import { forgetAppLists } from "./cache";

type Props = {
  /** Scan now waits until setup is done: setup's own scan just ran. */
  canScan: boolean;
};

/** The page's title with when the last scan ran, and Scan now; the apps reload once a scan ends. */
export function AppsHeader({ canScan }: Props) {
  // A scan started elsewhere, such as in Settings, changes the scan outside this cache.
  const scanQuery = useQuery(AppsScanDocument, { fetchPolicy: "cache-and-network" });
  const connection = scanQuery.data?.setup.googleWorkspace;
  const isScanning = connection?.scan?.status === "SCANNING";
  usePollWhileScanning(isScanning, scanQuery);
  useReloadAppsAfterScan(isScanning);
  const [scanNow, { loading, error }] = usePayloadMutation(ScanNowDocument);

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

type Connection = NonNullable<AppsScanQuery["setup"]["googleWorkspace"]>;

/** "Scanned today at 08:00": page headers show the last scan without the full stop. */
function lastScan(connection: Connection): string {
  return formatLastScan(connection.scan?.readAt ?? null).replace(/\.$/, "");
}

/**
 * Reloads the app lists and counts once a scan ends: its results commit with its end, so a list
 * read while it ran may predate them.
 */
function useReloadAppsAfterScan(isScanning: boolean) {
  const cache = useCache();
  const wasScanning = useRef(isScanning);
  useEffect(() => {
    if (wasScanning.current && !isScanning) {
      forgetAppLists(cache);
    }
    wasScanning.current = isScanning;
  }, [isScanning, cache]);
}
