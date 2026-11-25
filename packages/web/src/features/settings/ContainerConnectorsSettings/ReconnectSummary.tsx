import {
  connectsWithText,
  failsUntilLine,
  foundLine,
  integrationUserOf,
  reconnectCauseLine,
} from "@/features/apps";
import { t } from "@/i18n";

import type { ContainerConnector } from "./ContainerConnectorCard";

type Props = {
  connector: ContainerConnector;
  connection: NonNullable<ContainerConnector["connection"]>;
};

/** Why a connection needs reconnecting, what found it, what fails meanwhile and how to reconnect. */
export function ReconnectSummary({ connector, connection }: Props) {
  const reason = connection.reconnectReason;
  const withKey = connectsWithText(connector);
  const reconnecting = {
    app: connector.name,
    withSession: !withKey,
    email: connection.connectionUserEmail ?? null,
    workspace: connection.scan?.sourceName ?? connector.name,
    integrationUser: integrationUserOf(connection),
  };

  return (
    <>
      {reason && (
        <p className="text-sm text-amber-900">
          {`${reconnectCauseLine(reason.cause, reconnecting)} ${foundLine(reason)}`}
        </p>
      )}
      <p className="text-sm text-foreground/80">{failsUntilLine(reconnecting)}</p>
      {reconnecting.integrationUser?.suspended && (
        <p className="text-sm text-muted-foreground">
          {t("apps.reconnect.integrationUserSuspendedHint")}
        </p>
      )}
      {!withKey && !reconnecting.integrationUser && (
        <p className="text-sm text-muted-foreground">
          {t("apps.reconnect.signInHint", { app: connector.name })}
        </p>
      )}
    </>
  );
}
