import {
  EXAMPLE_RECORD,
  EXAMPLE_REGISTRATION,
  expect,
  OWNER,
  recordHistory,
  SYSTEM,
  test,
} from "#test/support";

import { createRecordHistoryReaderService } from ".";

test("reads only lines that change one of the listed fields", async ({ orm, transact }) => {
  const lines = await transact((tx) =>
    recordHistory.append(OWNER, tx, {
      recordType: "example",
      operation: "UPDATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [["firstName"], ["firstName", "phone"], ["email"], ["phoneExtra"]].map((fields) => ({
        recordId: EXAMPLE_RECORD.recordId,
        changes: fields.map((field) => ({ field, oldValue: null, newValue: "Changed" })),
      })),
    }),
  );
  const reader = createRecordHistoryReaderService(orm, { example: EXAMPLE_REGISTRATION });

  const page = await reader.readHistory(SYSTEM, "example", EXAMPLE_RECORD.recordId, {
    changingAnyOf: ["phone", "email"],
  });

  expect(page.edges.map(({ node }) => node)).toEqual([lines[2], lines[1]]);
});

test("matches every field under a name ending in *", async ({ orm, transact }) => {
  const lines = await transact((tx) =>
    recordHistory.append(OWNER, tx, {
      recordType: "example",
      operation: "UPDATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: ["address.home", "address.work", "address", "addressExtra.annual"].map((field) => ({
        recordId: EXAMPLE_RECORD.recordId,
        changes: [{ field, oldValue: null, newValue: "Changed" }],
      })),
    }),
  );
  const reader = createRecordHistoryReaderService(orm, { example: EXAMPLE_REGISTRATION });

  const page = await reader.readHistory(SYSTEM, "example", EXAMPLE_RECORD.recordId, {
    changingAnyOf: ["address.*"],
  });

  expect(page.edges.map(({ node }) => node)).toEqual([lines[1], lines[0]]);
});

test("reads only lines that change none of the listed fields", async ({ orm, transact }) => {
  const lines = await transact((tx) =>
    recordHistory.append(OWNER, tx, {
      recordType: "example",
      operation: "UPDATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [
        ["firstName", "lastName"],
        ["firstName", "phone"],
        ["address.home"],
        ["address"],
      ].map((fields) => ({
        recordId: EXAMPLE_RECORD.recordId,
        changes: fields.map((field) => ({ field, oldValue: null, newValue: "Changed" })),
      })),
    }),
  );
  const reader = createRecordHistoryReaderService(orm, { example: EXAMPLE_REGISTRATION });

  const page = await reader.readHistory(SYSTEM, "example", EXAMPLE_RECORD.recordId, {
    changingNoneOf: ["phone", "address.*"],
  });

  expect(page.edges.map(({ node }) => node)).toEqual([lines[3], lines[0]]);
});

test("pages through the kept lines only", async ({ orm, transact }) => {
  const lines = await transact((tx) =>
    recordHistory.append(OWNER, tx, {
      recordType: "example",
      operation: "UPDATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: ["firstName", "phone", "lastName", "phone", "firstName"].map((field) => ({
        recordId: EXAMPLE_RECORD.recordId,
        changes: [{ field, oldValue: null, newValue: "Changed" }],
      })),
    }),
  );
  const reader = createRecordHistoryReaderService(orm, { example: EXAMPLE_REGISTRATION });

  const first = await reader.readHistory(SYSTEM, "example", EXAMPLE_RECORD.recordId, {
    first: 1,
    changingAnyOf: ["phone"],
  });
  const second = await reader.readHistory(SYSTEM, "example", EXAMPLE_RECORD.recordId, {
    first: 1,
    after: first.pageInfo.endCursor,
    changingAnyOf: ["phone"],
  });

  expect(first.edges.map(({ node }) => node)).toEqual([lines[3]]);
  expect(first.pageInfo.hasNextPage).toBe(true);
  expect(second.edges.map(({ node }) => node)).toEqual([lines[1]]);
  expect(second.pageInfo.hasNextPage).toBe(false);
});
