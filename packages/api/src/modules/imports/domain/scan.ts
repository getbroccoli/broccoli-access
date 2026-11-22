import type { ConnectorErrorCode } from "../../../core/connectors";
import type { ImportSource, ScanStatus } from "./importSource";

/** A connection's scans as the scan page shows them: the one running, or the last one's outcome. */
export interface Scan {
  /** The import source the scans read into. */
  id: string;
  /** What the UI calls the source, such as the Google domain or the app's workspace name. */
  sourceName: string;
  status: ScanStatus;
  failure: ConnectorErrorCode | null;
  readAt: Date | null;
  people: ScanPeopleStep;
  apps: ScanAppsStep;
  signInLogs: ScanSignInLogsStep;
}

/** Reading the directory's people: running, then how many it read, or failed. */
export interface ScanPeopleStep {
  state: ScanStepState;
  /** Null until the step is done. */
  count: number | null;
  suspended: number | null;
}

/** Finding the apps people signed in to with the directory: waiting, then how many, or failed. */
export interface ScanAppsStep {
  state: ScanStepState;
  /** Null until the step is done. */
  count: number | null;
}

/** Reading the sign-in logs that date the grants. */
export interface ScanSignInLogsStep {
  state: ScanStepState;
}

/** Where one step of a scan is; a step waits while the people are read. */
export type ScanStepState = "waiting" | "running" | "done" | "failed";

/** How far a running scan got; it lives in the process running the scan. */
export interface ScanProgress {
  /** Null while the accounts are being read. */
  found: ScanCounts | null;
}

/** What a scan found: the directory's people, and the apps they signed in to. */
export interface ScanCounts {
  people: number;
  suspended: number;
  apps: number;
}

/**
 * The scan of `source`: a running one by its progress, which a restart loses, and a finished one
 * by what its sync saved.
 */
export function scanOf(
  source: ImportSource,
  { progress, saved }: { progress: ScanProgress | null; saved: ScanCounts | null },
): Scan {
  const { id, name, status, failure, readAt } = source;
  return { id, sourceName: name, status, failure, readAt, ...steps(status, progress, saved) };
}

/** What a directory scan does with a person's photo. */
export type PhotoUpdate = "read" | "clear" | "keep";

/**
 * Reads a photo whose version changed since the last scan, or one the person has none stored of,
 * so a failed read is tried again; clears a photo the directory removed, and keeps the rest.
 */
export function photoUpdateOf({
  version,
  previousVersion,
  hasPhoto,
}: {
  version: string | null;
  previousVersion: string | null;
  hasPhoto: boolean;
}): PhotoUpdate {
  if (version === null) {
    return hasPhoto ? "clear" : "keep";
  }
  return version !== previousVersion || !hasPhoto ? "read" : "keep";
}

function steps(
  status: ScanStatus,
  progress: ScanProgress | null,
  saved: ScanCounts | null,
): Pick<Scan, "people" | "apps" | "signInLogs"> {
  if (status === "scan_failed") {
    return {
      people: { state: "failed", count: null, suspended: null },
      apps: { state: "failed", count: null },
      signInLogs: { state: "failed" },
    };
  }
  const found = status === "scanned" ? saved : (progress?.found ?? null);
  if (!found) {
    return {
      people: { state: "running", count: null, suspended: null },
      apps: { state: "waiting", count: null },
      signInLogs: { state: "waiting" },
    };
  }
  return {
    people: { state: "done", count: found.people, suspended: found.suspended },
    apps: { state: "done", count: found.apps },
    signInLogs: { state: "done" },
  };
}
