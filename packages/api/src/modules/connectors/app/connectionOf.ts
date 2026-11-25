import { isDeepStrictEqual } from "node:util";

import { invalidInput } from "../../../core/applicationError";
import type { AppSessionSource, ConnectionDetails } from "../../../core/connectors";
import type { Logger } from "../../../core/logger";
import type { SecurityContext } from "../../../core/security";
import { parseAppSession } from "../domain";
import type { AppSessionHandOvers, ConfirmedWorkspace } from "./appSessionHandOvers";
import { appSessionFieldOf, type ContainerConnector } from "./containerConnectors";
import { ownerInputField } from "./testedConnection";

/** Settings and secrets as the connector reads them. */
export interface Connection {
  settings: Record<string, unknown>;
  secrets: Record<string, unknown>;
  /** For a handed-over session: the workspace the owner confirmed, which connecting must still reach. */
  workspace?: ConfirmedWorkspace;
  /** For a session: who made it, the extension's hand-over or the integration user's sign-in. */
  sessionFrom?: AppSessionSource;
}

/**
 * The connection the owner gives: the app session sealed at its hand-over, with the workspace they
 * confirmed and its settings, which the test before saving sends and compares, or the typed values.
 */
export function connectionOf(
  ctx: SecurityContext,
  connector: ContainerConnector,
  {
    values = [],
    appSession,
  }: { values?: readonly { key: string; value: string }[]; appSession?: string | null },
  { handOvers, logger }: { handOvers: AppSessionHandOvers; logger: Logger },
): Connection {
  const field = appSessionFieldOf(connector);
  if (!field) {
    return typedConnection(connector, values);
  }
  if (!appSession) {
    throw invalidInput([{ field: "appSession", code: "required" }]);
  }
  const handedOver =
    ctx.user && handOvers.open(appSession, { userId: ctx.user.userId, connector: connector.key });
  // Checked again: the connector's manifest may have narrowed since the hand-over.
  const session = handedOver && parseAppSession(handedOver.appSession, field);
  if (!handedOver || !session) {
    logger.warn(
      { connector: connector.key },
      "Connect refused: the hand-over is changed, expired or another's",
    );
    throw invalidInput([{ field: "appSession", code: "invalid" }]);
  }
  const { settings, workspace, sessionFrom } = handedOver;
  return { settings, secrets: { [field.key]: session }, workspace, sessionFrom };
}

/** Whether the test found another workspace than the one the owner confirmed at the hand-over. */
export function isOtherWorkspace(
  { workspace, settings }: Connection,
  details: ConnectionDetails,
): boolean {
  const found = details.connection?.settings;
  return (
    details.organizationName !== workspace?.organizationName ||
    details.domain !== workspace.domain ||
    (found !== undefined && !isDeepStrictEqual(found, settings))
  );
}

/**
 * Refuses reconnecting with a connection whose test reaches another workspace than the stored
 * one: other settings, or, for a hand-over, another workspace than the hand-over found.
 */
export function refuseOtherWorkspace(
  {
    connector,
    connection,
    details,
    stored,
  }: {
    connector: ContainerConnector;
    connection: Connection;
    details: ConnectionDetails;
    stored: { id: string; settings: Record<string, unknown> };
  },
  logger: Logger,
): void {
  const settings = { ...connection.settings, ...details.connection?.settings };
  const handedOverElsewhere =
    appSessionFieldOf(connector) !== undefined && isOtherWorkspace(connection, details);
  if (!handedOverElsewhere && isDeepStrictEqual(settings, stored.settings)) {
    return;
  }
  logger.warn(
    { connector: connector.key, connectionId: stored.id },
    "Reconnect refused: the test reaches another workspace",
  );
  throw invalidInput([{ field: ownerInputField(connector), code: "wrong_workspace" }]);
}

/** The trimmed values as the connection's settings and secrets, refusing a missing or unknown one. */
function typedConnection(
  connector: ContainerConnector,
  values: readonly { key: string; value: string }[],
): Connection {
  const valueByKey = new Map(values.map(({ key, value }) => [key, value.trim()]));
  const fieldKeys = new Set(connector.connectionFields.map(({ key }) => key));
  const keys = values.map(({ key }) => key);
  const repeatedKeys = new Set(keys.filter((key, index) => keys.indexOf(key) !== index));
  const fieldErrors = [
    ...[...repeatedKeys].map((key) => ({ field: `values.${key}`, code: "duplicate" })),
    ...[...fieldKeys]
      .filter((key) => !valueByKey.get(key))
      .map((key) => ({ field: `values.${key}`, code: "required" })),
    ...[...valueByKey.keys()]
      .filter((key) => !fieldKeys.has(key))
      .map((key) => ({ field: `values.${key}`, code: "unknown" })),
  ];
  if (fieldErrors.length > 0) {
    throw invalidInput(fieldErrors);
  }
  const fieldsWhere = (secret: boolean) =>
    Object.fromEntries(
      connector.connectionFields
        .filter((field) => field.secret === secret)
        .map(({ key }) => [key, valueByKey.get(key)!]),
    );
  return { settings: fieldsWhere(false), secrets: fieldsWhere(true) };
}
