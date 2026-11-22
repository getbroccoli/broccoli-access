import type { Orm } from "../db";
import { readSdl, type Resolvers } from "../graphql";
import { collectRegistrations } from "../../utils";
import { createRecordHistoryReaderService, type RecordTypeRegistry } from "./app";
import { createResolvers } from "./graphql";

// Public values.
export { createRecordHistoryReaderService, createRecordHistoryService } from "./app";
export { changeReasonSchema, parseChangeReason } from "./domain";

// Public types.
export type {
  LoadedRecord,
  RecordChanged,
  RecordTypeRegistration,
  RecordTypeRegistry,
} from "./app";
export type {
  CauseKinds,
  FieldChange,
  HistoryAppend,
  HistoryAuthor,
  HistoryLine,
  RecordOperation,
  RecordType,
  RecordTypes,
} from "./domain";

/**
 * The shared record capabilities in the API: the history types and the `recordHistory` query, for
 * each record type the modules register.
 */
export function recordsManifest(
  { orm }: { orm: Orm },
  modules: readonly { recordTypes?: RecordTypeRegistry }[],
): { name: string; typeDefs: string; resolvers: Resolvers } {
  const registry: RecordTypeRegistry = collectRegistrations(
    "record type",
    modules.flatMap(({ recordTypes }) => (recordTypes ? [recordTypes] : [])),
  );
  return {
    name: "records",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(registry, createRecordHistoryReaderService(orm, registry)),
  };
}
