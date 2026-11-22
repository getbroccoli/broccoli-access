import { and, count, desc, eq, gte, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { anyOf, type Orm, ormOf, type Tx } from "../../../core/db";
import type { AccountChange } from "../domain";
import { accountChanges, type StoredAttempt } from "./accountChangesTable";

/** Account changes in Postgres, through the pool or inside a transaction. */
export interface AccountChangeRepository {
  /** Stores a running change; null when its account already has one running. */
  insertRunning(
    change: Omit<
      AccountChange,
      "id" | "appAccountId" | "status" | "attempts" | "error" | "finishedAt"
    > & { appAccountId: string },
  ): Promise<AccountChange | null>;
  findById(id: string): Promise<AccountChange | null>;
  /** Like `findById`, locking the row until the transaction ends. */
  lockById(id: string): Promise<AccountChange | null>;
  /** Ends a running change with its outcome; a change no longer running stays as it is. */
  finish(
    id: string,
    outcome: Pick<AccountChange, "attempts" | "error"> & {
      status: "succeeded" | "failed";
      finishedAt: Date;
    },
  ): Promise<void>;
  /** Those of the accounts whose change is running, or succeeded at or after `since`. */
  findAccountsChangedSince(appAccountIds: readonly string[], since: Date): Promise<string[]>;
  /** Each account's newest change; an account without one is left out. */
  findLatestOfAccounts(appAccountIds: readonly string[]): Promise<AccountChange[]>;
  /** For each change of `changeIds`, how many running changes of its connection were asked before it. */
  countChangesAhead(changeIds: readonly string[]): Promise<Map<string, number>>;
}

export function accountChangeRepository(db: Orm | Tx): AccountChangeRepository {
  const orm = () => ormOf(db);
  return {
    insertRunning: async (change) => {
      const [stored] = await orm()
        .insert(accountChanges)
        .values({ ...change, status: "running", attempts: [] })
        // Waits for a concurrent ask of the same account, then stores nothing if it committed.
        .onConflictDoNothing({
          target: accountChanges.appAccountId,
          where: sql`${accountChanges.status} = 'running'`,
        })
        .returning();
      return stored ? toChange(stored) : null;
    },
    findById: async (id) => {
      const [row] = await orm().select().from(accountChanges).where(eq(accountChanges.id, id));
      return row ? toChange(row) : null;
    },
    lockById: async (id) => {
      const [row] = await orm()
        .select()
        .from(accountChanges)
        .where(eq(accountChanges.id, id))
        .for("update");
      return row ? toChange(row) : null;
    },
    finish: async (id, { status, attempts, error, finishedAt }) => {
      await orm()
        .update(accountChanges)
        .set({ status, attempts: attempts.map(storedAttempt), error, finishedAt })
        .where(and(eq(accountChanges.id, id), eq(accountChanges.status, "running")));
    },
    findAccountsChangedSince: async (appAccountIds, since) => {
      const rows = await orm()
        .selectDistinct({ appAccountId: accountChanges.appAccountId })
        .from(accountChanges)
        .where(
          and(
            anyOf(accountChanges.appAccountId, appAccountIds),
            or(
              eq(accountChanges.status, "running"),
              and(eq(accountChanges.status, "succeeded"), gte(accountChanges.finishedAt, since)),
            ),
          ),
        );
      return rows.map(({ appAccountId }) => appAccountId!);
    },
    findLatestOfAccounts: async (appAccountIds) => {
      const rows = await orm()
        .selectDistinctOn([accountChanges.appAccountId])
        .from(accountChanges)
        .where(anyOf(accountChanges.appAccountId, appAccountIds))
        .orderBy(
          accountChanges.appAccountId,
          desc(accountChanges.requestedAt),
          desc(accountChanges.id),
        );
      return rows.map(toChange);
    },
    countChangesAhead: async (changeIds) => {
      const ahead = alias(accountChanges, "ahead");
      const rows = await orm()
        .select({ id: accountChanges.id, ahead: count(ahead.id) })
        .from(accountChanges)
        .leftJoin(
          ahead,
          and(
            eq(ahead.connectionId, accountChanges.connectionId),
            eq(ahead.status, "running"),
            or(
              lt(ahead.requestedAt, accountChanges.requestedAt),
              and(
                eq(ahead.requestedAt, accountChanges.requestedAt),
                lt(ahead.id, accountChanges.id),
              ),
            ),
          ),
        )
        .where(anyOf(accountChanges.id, changeIds))
        .groupBy(accountChanges.id);
      return new Map(rows.map(({ id, ahead: changesAhead }) => [id, changesAhead]));
    },
  };
}

function toChange(row: typeof accountChanges.$inferSelect): AccountChange {
  return {
    ...row,
    attempts: row.attempts.map((attempt) => ({ ...attempt, at: new Date(attempt.at) })),
  };
}

function storedAttempt(attempt: AccountChange["attempts"][number]): StoredAttempt {
  return { ...attempt, at: attempt.at.toISOString() };
}
