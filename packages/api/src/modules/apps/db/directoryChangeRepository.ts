import { and, desc, eq, gt, isNotNull, lte, ne } from "drizzle-orm";

import { anyOf, type Orm, ormOf, type Tx } from "../../../core/db";
import type { AccountChange } from "../domain";
import { accountChanges, firstPasswordColumn } from "./accountChangesTable";

export interface DirectoryChangeRepository {
  findLatest(
    employeeIds: readonly string[],
    connectionId: string,
  ): Promise<Map<string, DirectoryInvite>>;
  /** The change's stored first password; null without one. */
  readFirstPassword(changeId: string): Promise<string | null>;
  /** The latest first password another directory creation of the person stored; null without one. */
  findEarlierFirstPassword(
    employeeId: string,
    connectionId: string,
    changeId: string,
  ): Promise<{ id: string; encrypted: string } | null>;
  /** Stores the change's encrypted first password, or clears it with null. */
  saveFirstPassword(changeId: string, encryptedFirstPassword: string | null): Promise<void>;
  takeFirstPassword(
    employeeId: string,
    connectionId: string,
    validSince: Date,
  ): Promise<{ id: string; email: string; encrypted: string } | null>;
  expireFirstPasswords(validSince: Date): Promise<void>;
}

interface DirectoryInvite extends Pick<AccountChange, "email" | "error" | "status" | "finishedAt"> {
  hasPassword: boolean;
}

export function directoryChangeRepository(db: Orm | Tx): DirectoryChangeRepository {
  const orm = ormOf(db);
  const changes = accountChanges;
  return {
    async findLatest(employeeIds, connectionId) {
      const rows = await orm
        .selectDistinctOn([changes.employeeId], {
          employeeId: changes.employeeId,
          email: changes.email,
          error: changes.error,
          status: changes.status,
          finishedAt: changes.finishedAt,
          hasPassword: isNotNull(firstPasswordColumn).as("has_password"),
        })
        .from(changes)
        .where(directoryInvites(employeeIds, connectionId))
        .orderBy(changes.employeeId, desc(changes.requestedAt), desc(changes.id));
      return new Map(
        rows.map(({ employeeId, email, error, status, hasPassword, finishedAt }) => [
          employeeId!,
          {
            status,
            email,
            error,
            hasPassword: !!hasPassword,
            finishedAt,
          },
        ]),
      );
    },
    async readFirstPassword(id) {
      const [row] = await orm
        .select({ encrypted: firstPasswordColumn })
        .from(changes)
        .where(eq(changes.id, id));
      return row?.encrypted ?? null;
    },
    async findEarlierFirstPassword(employeeId, connectionId, changeId) {
      const [row] = await orm
        .select({ id: changes.id, encrypted: firstPasswordColumn })
        .from(changes)
        .where(
          and(
            directoryInvites([employeeId], connectionId),
            ne(changes.id, changeId),
            isNotNull(firstPasswordColumn),
          ),
        )
        .orderBy(desc(changes.requestedAt), desc(changes.id))
        .limit(1);
      return row?.encrypted ? { id: row.id, encrypted: row.encrypted } : null;
    },
    async saveFirstPassword(id, encryptedFirstPassword) {
      await orm.update(changes).set({ encryptedFirstPassword }).where(eq(changes.id, id));
    },
    async takeFirstPassword(employeeId, connectionId, validSince) {
      const [row] = await orm
        .select({ id: changes.id, email: changes.email, encrypted: firstPasswordColumn })
        .from(changes)
        .where(
          and(
            directoryInvites([employeeId], connectionId),
            eq(changes.status, "succeeded"),
            gt(changes.finishedAt, validSince),
            isNotNull(firstPasswordColumn),
          ),
        )
        .orderBy(desc(changes.requestedAt), desc(changes.id))
        .limit(1)
        .for("update");
      if (!row?.encrypted) return null;
      await orm.update(changes).set({ encryptedFirstPassword: null }).where(eq(changes.id, row.id));
      return { id: row.id, email: row.email, encrypted: row.encrypted };
    },
    async expireFirstPasswords(validSince) {
      await orm
        .update(changes)
        .set({ encryptedFirstPassword: null })
        .where(and(isNotNull(firstPasswordColumn), lte(changes.finishedAt, validSince)));
    },
  };
}

function directoryInvites(employeeIds: readonly string[], connectionId: string) {
  return and(
    anyOf(accountChanges.employeeId, employeeIds),
    eq(accountChanges.connectionId, connectionId),
    eq(accountChanges.action, "invite"),
    eq(accountChanges.startedFrom, "provision"),
  );
}
