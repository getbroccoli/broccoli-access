import type { ContainerConnectorsSettingsQuery } from "@/__generated__/graphql";
import { connectingFieldName } from "@/features/apps";
import { t } from "@/i18n";
import { formatLastScan } from "@/lib/lastScan";
import { formatSince } from "@/lib/since";

type Connector = ContainerConnectorsSettingsQuery["containerConnectors"][number];

type Props = {
  connector: Pick<Connector, "name" | "connectionFields">;
  connection: NonNullable<Connector["connection"]>;
};

/** A connected app's workspace, whose key or session connects it, its last scan and its notice. */
export function ConnectionSummary({ connector, connection }: Props) {
  const { scan, noticeAcceptedAt } = connection;
  const workspace = scan?.sourceName ?? "";

  return (
    <>
      <p className="text-sm text-foreground/80">{summaryOf(connector, connection, workspace)}</p>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {scan?.status === "SCANNING" ? t("scans.scanning") : lastScan(scan)}
        {noticeAcceptedAt &&
          ` ${t("settings.apps.noticeAccepted", {
            app: connector.name,
            day: formatSince({ at: noticeAcceptedAt, before: false }),
          })}`}
      </p>
      {scan?.status === "SCAN_FAILED" && (
        <p className="text-sm text-destructive">{t("settings.connections.scanFailed")}</p>
      )}
    </>
  );
}

/** Which workspace is connected, with whose key or app session. */
function summaryOf(
  connector: Props["connector"],
  { connectionUserEmail: email, sessionFrom, scan }: Props["connection"],
  workspace: string,
): string {
  if (connector.connectionFields.some(({ kind }) => kind === "APP_SESSION")) {
    const app = connector.name;
    const actsAsIntegrationUser = sessionFrom === "SERVER_SIGN_IN";
    // After Switch, the last scan's member is the owner until the running scan saves.
    const isEmailCurrent = !(actsAsIntegrationUser && scan?.status === "SCANNING");
    if (email && isEmailCurrent) {
      return t("settings.apps.summaryAppSession", { workspace, app, email });
    }
    return actsAsIntegrationUser
      ? t("settings.apps.summaryIntegrationUserBeforeScan", { workspace, app })
      : t("settings.apps.summaryAppSessionBeforeScan", { workspace, app });
  }
  const field = connectingFieldName(connector.connectionFields);
  return email
    ? t("settings.apps.summary", { workspace, field, email })
    : t("settings.apps.summaryBeforeScan", { workspace, field });
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
