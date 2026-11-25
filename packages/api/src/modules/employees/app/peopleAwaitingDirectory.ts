import type { Orm, Tx } from "../../../core/db";
import { createRecordHistoryService } from "../../../core/records";

const history = createRecordHistoryService();

export type ReadPeopleAwaitingDirectory = (
  db: Orm | Tx,
  ids: readonly string[],
) => Promise<Set<string>>;

/** People added from Google Workspace whom its directory has never listed. */
export async function findPeopleAwaitingDirectory(
  db: Orm | Tx,
  ids: readonly string[],
  readSourceId: (db: Orm | Tx) => Promise<string | null | undefined>,
): Promise<Set<string>> {
  if (!ids.length) return new Set();
  // Add person records the directory connection as the reference of its creation line.
  const added = await history.readRecordIdsWithCause(db, {
    recordType: "employee",
    recordIds: ids,
    causeKind: "EDITED_DIRECTLY",
    operation: "CREATED",
    withReference: true,
  });
  if (!added.size) return added;
  const sourceId = await readSourceId(db);
  if (!sourceId) return added;
  const found = await history.readRecordIdsWithCause(db, {
    recordType: "employee",
    recordIds: [...added],
    causeKind: "FOUND_BY_SCAN",
    operation: "UPDATED",
    reference: sourceId,
  });
  return new Set([...added].filter((id) => !found.has(id)));
}
