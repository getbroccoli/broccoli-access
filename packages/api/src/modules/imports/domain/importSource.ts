import { CONNECTOR_ERROR_CODES, type ConnectorErrorCode } from "../../../core/connectors";

/** Where an import source's records come from; a later circle adds CSV files. */
export const IMPORT_SOURCE_KINDS = ["app_connection"] as const;

/** Where the source's scan is: running, finished, or failed with a connector error. */
export const SCAN_STATUSES = ["scanning", "scanned", "scan_failed"] as const;

/** Why the last scan failed: the connector's error. */
export const SCAN_FAILURES = CONNECTOR_ERROR_CODES;

export type ScanStatus = (typeof SCAN_STATUSES)[number];

/** One place a scan reads from: in circle 1, an app connection. */
export interface ImportSource {
  id: string;
  kind: (typeof IMPORT_SOURCE_KINDS)[number];
  connectionId: string;
  name: string;
  status: ScanStatus;
  /** Set exactly when `status` is `scan_failed`. */
  failure: ConnectorErrorCode | null;
  /** When the last successful scan finished; null before one. */
  readAt: Date | null;
  createdAt: Date;
}
