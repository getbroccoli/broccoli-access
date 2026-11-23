import type { AppPageQuery } from "@/__generated__/graphql";
import { t } from "@/i18n";

import { connectingFieldName } from "../connectingFieldName";
import { connectsWithText } from "../connectsWithText";
import { ReconnectButton } from "../ReconnectButton";
import { failsUntilLine, reconnectCauseLine } from "../reconnectReason";

type Props = {
  connection: NonNullable<NonNullable<AppPageQuery["app"]>["containerConnection"]>;
};

/** Why the app's connection needs reconnecting, what fails meanwhile, and Reconnect <app>. */
export function ReconnectBanner({ connection }: Props) {
  const { connector, reconnectReason } = connection;
  const reconnecting = {
    app: connector.name,
    keyName: connectsWithText(connector) ? connectingFieldName(connector.connectionFields) : null,
    email: connection.connectionUserEmail ?? null,
    workspace: connection.scan?.sourceName ?? null,
  };
  const lines = [
    reconnectReason && reconnectCauseLine(reconnectReason.cause, reconnecting),
    failsUntilLine(reconnecting),
  ];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-amber-900 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm">{lines.filter(Boolean).join(" ")}</p>
      <div className="shrink-0">
        <ReconnectButton
          connector={connector}
          label={t("apps.reconnect.appButton", { app: connector.name })}
        />
      </div>
    </div>
  );
}
