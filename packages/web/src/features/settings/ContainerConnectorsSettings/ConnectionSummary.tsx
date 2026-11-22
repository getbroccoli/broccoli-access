import type { ContainerConnectorsSettingsQuery } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { formatLastScan } from "@/lib/lastScan";

import { connectingFieldName } from "./connectingFieldName";

type Connector = ContainerConnectorsSettingsQuery["containerConnectors"][number];

type Props = {
  connector: Pick<Connector, "connectionFields">;
  connection: NonNullable<Connector["connection"]>;
};

/** A connected app's workspace, whose key or session connects it, and its last scan. */
export function ConnectionSummary({ connector, connection }: Props) {
  const { scan, connectionUserEmail } = connection;
  const field = connectingFieldName(connector.connectionFields);
  const workspace = scan?.sourceName ?? "";

  return (
    <>
      <p className="text-sm text-foreground/80">
        {connectionUserEmail
          ? t("settings.apps.summary", { workspace, field, email: connectionUserEmail })
          : t("settings.apps.summaryBeforeScan", { workspace, field })}
      </p>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {scan?.status === "SCANNING" ? t("scans.scanning") : lastScan(scan)}
      </p>
      {scan?.status === "SCAN_FAILED" && (
        <p className="text-sm text-destructive">{t("settings.connections.scanFailed")}</p>
      )}
    </>
  );
}

/** "7 members. Scanned today at 08:00." once a scan saved them. */
function lastScan(scan: NonNullable<Props["connection"]>["scan"]): string {
  const scanned = formatLastScan(scan?.readAt ?? null);
  const count = scan?.people.count;
  if (count == null) {
    return scanned;
  }
  const members =
    count === 1
      ? t("settings.apps.oneMember")
      : t("settings.apps.members", { count: String(count) });
  return `${members} ${scanned}`;
}
