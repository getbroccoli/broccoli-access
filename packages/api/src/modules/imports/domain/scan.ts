import type { ConnectorErrorCode } from "../../../core/connectors";
import type { ImportSource, ScanStatus } from "./importSource";

/** A connection's scans as the scan page shows them: the one running, or the last one's outcome. */
export interface Scan {
  /** The import source the scans read into. */
  id: string;
  status: ScanStatus;
  failure: ConnectorErrorCode | null;
  readAt: Date | null;
  people: ScanPeopleStep;
}

/** Reading the directory's people: running, then how many it read, or failed. */
export interface ScanPeopleStep {
  state: "running" | "done" | "failed";
  /** Null until the step is done. */
  count: number | null;
  suspended: number | null;
}

/** How far a running scan got; it lives in the process running the scan. */
export interface ScanProgress {
  /** Null while the people are being read. */
  people: PeopleCount | null;
}

export interface PeopleCount {
  count: number;
  suspended: number;
}

/**
 * The scan of `source`: a running one by its progress, which a restart loses, and a finished one
 * by the people its sync saved.
 */
export function scanOf(
  source: ImportSource,
  { progress, saved }: { progress: ScanProgress | null; saved: PeopleCount | null },
): Scan {
  const { id, status, failure, readAt } = source;
  return { id, status, failure, readAt, people: peopleStep(status, progress, saved) };
}

function peopleStep(
  status: ScanStatus,
  progress: ScanProgress | null,
  saved: PeopleCount | null,
): ScanPeopleStep {
  if (status === "scan_failed") {
    return { state: "failed", count: null, suspended: null };
  }
  const read = status === "scanned" ? saved : (progress?.people ?? null);
  return read ? { state: "done", ...read } : { state: "running", count: null, suspended: null };
}
