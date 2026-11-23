import { ApplicationError, invalidInput } from "../../../core/applicationError";
import {
  type ConnectionDetails,
  ConnectorError,
  type ConnectorErrorCode,
  withConnectorRetries,
} from "../../../core/connectors";
import type { Connection } from "./connectionOf";
import type { ContainerConnectionDependencies } from "./containerConnectionService";
import { appSessionFieldOf, type ContainerConnector } from "./containerConnectors";

/**
 * The app's answer to the connection; a refusal is invalid input on what the owner gave (the
 * values or the app session), any other failure unavailable.
 */
export async function testedConnection(
  { logger, wait }: ContainerConnectionDependencies,
  connector: ContainerConnector,
  connection: Connection,
): Promise<ConnectionDetails> {
  try {
    const session = await connector.openSession(connection);
    return await withConnectorRetries(() => session.testConnection(), {
      wait,
      onRetry: (failure, attempt) =>
        logger.info(
          { connector: connector.key, failure, attempt },
          "Connection test failed; trying again",
        ),
    });
  } catch (error) {
    if (!(error instanceof ConnectorError)) {
      throw error;
    }
    logger.warn({ connector: connector.key, failure: error.code }, "Connection test failed");
    if (REFUSED_VALUES.includes(error.code)) {
      throw invalidInput([{ field: ownerInputField(connector), code: error.code }]);
    }
    throw new ApplicationError("UNAVAILABLE", "The app did not answer the connection test.");
  }
}

/** What the owner gives to connect: the app session the extension handed over, or the typed values. */
export function ownerInputField(connector: ContainerConnector): "appSession" | "values" {
  return appSessionFieldOf(connector) ? "appSession" : "values";
}

/** The connector errors that mean the app refused the values, which the owner can correct. */
const REFUSED_VALUES: readonly ConnectorErrorCode[] = [
  "authentication_failed",
  "permission_missing",
  "wrong_workspace",
];
