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
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "px-4")}
        >
          {t("settings.connections.changeApp")}
        </Link>
      </div>
    </article>
  );
}
