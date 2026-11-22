import type { AppsPageQuery } from "@/__generated__/graphql";

/** An app as the app table shows it. */
export type AppRow = AppsPageQuery["apps"]["edges"][number]["node"];

/** A row of the Approved tab: an approved app, or an app to connect that no scan has found. */
export type ApprovedAppRow = AppRow | AppToConnectRow;

/** An app a connector can manage that has no app yet: no page, users or findings, only Connect. */
type AppToConnectRow = NonNullable<AppsPageQuery["appsToConnect"]>[number];

export function isAppToConnect(row: ApprovedAppRow): row is AppToConnectRow {
  return row.__typename === "AppToConnect";
}

/**
 * Whether a connection reads the app; its managing connector's connection counts too, since a
 * connect's answer brings it before the app reloads.
 */
export function isConnected(app: Pick<AppRow, "connected" | "managingConnector">): boolean {
  return app.connected || Boolean(app.managingConnector?.connection);
}
