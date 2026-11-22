import { useQuery } from "@apollo/client/react";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";

import {
  ConnectionsSettingsDocument,
  type ConnectionsSettingsQuery,
  ScanNowDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { formatLastScan } from "@/lib/lastScan";
import { PageHeader } from "@/shell";

/** How often the page asks for the scan's outcome while it runs. */
const POLL_INTERVAL_MS = 1_000;

type Connection = NonNullable<ConnectionsSettingsQuery["setup"]["googleWorkspace"]>;

/** Settings' Connections page: where Broccoli Access finds people and their accounts. */
export function ConnectionsSettings() {
  const { data, error, refetch, startPolling, stopPolling } = useQuery(ConnectionsSettingsDocument);
  const connection = data?.setup.googleWorkspace;
  const isScanning = connection?.scan?.status === "SCANNING";
  useEffect(() => {
    if (!isScanning) {
      return;
    }
    startPolling(POLL_INTERVAL_MS);
    return stopPolling;
  }, [isScanning, startPolling, stopPolling]);

  return (
    <div className="flex max-w-4xl flex-col">
      <PageHeader
        title={t("settings.connections.title")}
        description={t("settings.connections.description")}
      />
      {connection ? (
        <GoogleWorkspaceCard connection={connection} />
      ) : error ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">{t("settings.connections.loadFailed")}</p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            {t("settings.connections.retry")}
          </Button>
        </div>
      ) : (
        !data && <Skeleton className="h-[150px] rounded-xl" />
      )}
    </div>
  );
}

/** The Google Workspace connection: who connected it with which Google app, and its last scan. */
function GoogleWorkspaceCard({ connection }: { connection: Connection }) {
  const [scanNow, { loading, error }] = usePayloadMutation(ScanNowDocument);
  const isScanning = connection.scan?.status === "SCANNING";

  return (
    <article
      aria-labelledby="google-workspace-title"
      className="flex flex-col gap-4 rounded-xl border border-border p-6 sm:flex-row sm:items-start"
    >
      <span
        aria-hidden
        className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-lg font-semibold text-blue-700"
      >
        G
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="google-workspace-title" className="text-base font-semibold">
            {t("settings.connections.googleWorkspace")}
          </h2>
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-deep">
            {t("settings.connections.connected")}
          </span>
        </div>
        <p className="text-sm text-foreground/80">
          {t("settings.connections.summary", {
            domain: connection.domain,
            email: connection.adminEmail,
          })}
        </p>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {isScanning
            ? t("settings.connections.scanning")
            : formatLastScan(connection.scan?.readAt ?? null)}
        </p>
        {connection.scan?.status === "SCAN_FAILED" && (
          <p className="text-sm text-destructive">{t("settings.connections.scanFailed")}</p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t("settings.connections.scanNowFailed")}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
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
          {t("settings.connections.scanNow")}
        </Button>
        <Link
          to="/settings/connections/google-app"
          className={buttonVariants({ variant: "outline", size: "lg", className: "px-4" })}
        >
          {t("settings.connections.changeApp")}
        </Link>
      </div>
    </article>
  );
}
