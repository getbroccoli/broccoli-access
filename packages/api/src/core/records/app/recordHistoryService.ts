import type { Orm, Tx } from "../../db";
import { type Connection, type PageArgs, paginate } from "../../pagination";
import type { SecurityContext } from "../../security";
import {
  HISTORY_SORT_VALUES,
  type HistoryCauseQuery,
  type HistoryFieldFilter,
  recordHistoryRepository,
} from "../db";
import {
  authorOf,
  type CauseKind,
  type HistoryAppend,
  type HistoryAuthor,
  type HistoryLine,
  type RecordOperation,
  type RecordType,
} from "../domain";

/** Writes and raw reads of record history, in the caller's `db` or `tx`; the caller authorizes them. */
export interface RecordHistoryService {
  /**
   * Appends one history line per record in `tx`, made by the author of `ctx`, and publishes one
   * `records.changed` per line. Returns the lines in the order of `append.records`.
   */
  append: (ctx: SecurityContext, tx: Tx, append: HistoryAppend) => Promise<HistoryLine[]>;
  /** One record's history, newest first, one page at a time, only the lines its field filter keeps. */
  read: (
    db: Orm | Tx,
    recordType: RecordType,
    recordId: string,
    args: HistoryPageArgs,
  ) => Promise<Connection<HistoryLine>>;
  /** Each of the records' newest line with `causeKind`, by record id; a record without one is left out. */
  readLatestWithCause: (
    db: Orm | Tx,
    recordType: RecordType,
    recordIds: readonly string[],
    causeKind: CauseKind,
  ) => Promise<Map<string, HistoryLine>>;
  /** IDs of the records whose history has a cause matching the query. */
  readRecordIdsWithCause: (db: Orm | Tx, query: HistoryCauseQuery) => Promise<Set<string>>;
}

/** A history page's arguments: the page, and which lines by the fields they change. */
export type HistoryPageArgs = PageArgs & HistoryFieldFilter;

/** A change to one record, published once its transaction commits; it carries field keys, never values. */
export interface RecordChanged {
  historyId: string;
  recordType: RecordType;
  recordId: string;
  operation: RecordOperation;
  fields: string[];
  causeKind: CauseKind;
  causeRef: string | null;
}

declare module "../../events" {
  interface DomainEvents {
    "records.changed": RecordChanged;
  }
}

export function createRecordHistoryService(): RecordHistoryService {
  return {
    async append(ctx, tx, { recordType, operation, cause, reason = null, requestedBy, records }) {
      const author = requestedBy ? requesterOf(ctx, requestedBy) : authorOf(ctx);
      const lines = await recordHistoryRepository(tx).insert(
        records.map(({ recordId, changes, cause: own = cause }) => ({
          recordType,
          recordId,
          operation,
          author,
          cause: { kind: own.kind, ref: own.ref ?? null },
          reason,
          changes,
        })),
      );
      for (const line of lines) {
        tx.publish("records.changed", {
          historyId: line.id,
          recordType,
          recordId: line.recordId,
          operation,
          fields: line.changes.map(({ field }) => field),
          causeKind: line.cause.kind,
          causeRef: line.cause.ref,
        });
      }
      return lines;
    },
    read: async (db, recordType, recordId, { changingAnyOf, changingNoneOf, ...page }) =>
      paginate(page, {
        order: { field: "NEWEST", direction: "DESC" },
        keysetValues: { NEWEST: HISTORY_SORT_VALUES },
        fetch: ({ after, limit }) =>
          recordHistoryRepository(db).findPage({
            recordType,
            recordId,
            after,
            limit,
            changingAnyOf,
            changingNoneOf,
          }),
      }),
    async readLatestWithCause(db, recordType, recordIds, causeKind) {
      const lines = await recordHistoryRepository(db).findLatestWithCause(
        recordType,
        recordIds,
        causeKind,
      );
      return new Map(lines.map((line) => [line.recordId, line]));
    },
    readRecordIdsWithCause: (db, query) =>
      recordHistoryRepository(db).findRecordIdsWithCause(query),
  };
}

/** The user a system change was asked by, as its author; any other caller is refused. */
function requesterOf(ctx: SecurityContext, userId: string): HistoryAuthor {
  ctx.requireSystem();
  return { kind: "SIGNED_IN_USER", id: userId };
}
