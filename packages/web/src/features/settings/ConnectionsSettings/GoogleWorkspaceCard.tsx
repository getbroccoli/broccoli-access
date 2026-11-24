import { Link } from "@tanstack/react-router";

import { type ConnectionsSettingsQuery, ScanNowDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button, buttonVariants } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";
import { formatLastScan } from "@/lib/lastScan";

type Props = {
  connection: NonNullable<ConnectionsSettingsQuery["setup"]["googleWorkspace"]>;
};

/** The Google Workspace connection: who connected it with which Google app, and its last scan. */
export function GoogleWorkspaceCard({ connection }: Props) {
  const [scanNow, { loading, error }] = usePayloadMutation(ScanNowDocument);
  const needsReconnect = connection.scan?.failure === "AUTHENTICATION_FAILED";
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
          <h3 id="google-workspace-title" className="text-base font-semibold">
            {t("settings.connections.googleWorkspace")}
          </h3>
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-deep">
            {needsReconnect ? t("apps.reconnect.button") : t("settings.connections.connected")}
          </span>
        </div>
        <p className="text-sm text-foreground/80">
          {t("settings.connections.summary", {
            domain: connection.domain,
            email: connection.adminEmail,
          })}
        </p>
        <p className="break-all text-sm text-muted-foreground">
          {connection.googleApp === "BROCCOLI_GOOGLE_APP"
            ? t("settings.connections.broccoliApp")
            : t("settings.connections.ownApp", { clientId: connection.clientId })}
        </p>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {isScanning ? t("scans.scanning") : formatLastScan(connection.scan?.readAt ?? null)}
        </p>
        {connection.scan?.status === "SCAN_FAILED" && (
          <p className="text-sm text-destructive">
            {needsReconnect
              ? t("settings.connections.googleReconnect")
              : t("settings.connections.scanFailed")}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t("scans.scanNowFailed")}
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
          {t("scans.scanNow")}
        </Button>
        <Link
          to="/settings/connections/google-app"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "px-4")}
        >
          {needsReconnect ? t("apps.reconnect.button") : t("settings.connections.changeApp")}
        </Link>
      </div>
    </article>
  );
}
