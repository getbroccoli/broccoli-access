import { eq, sql } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import type { ExtensionPairing } from "../domain";
import { extensionPairings } from "./extensionPairingsTable";

/** Extension pairings in Postgres, through the pool or inside a transaction. */
export interface ExtensionPairingRepository {
  /**
   * Pairs the user's browser, replacing their pairing with a new id, so a call that checked the
   * old token can no longer touch or delete the new pairing. Returns that id.
   */
  save(pairing: {
    userId: string;
    tokenHash: string;
    browser: string;
    pairedAt: Date;
  }): Promise<string>;
  findByUser(userId: string): Promise<ExtensionPairing | null>;
  /** The pairing with its token hash, to check a token against. */
  findWithTokenHash(id: string): Promise<{ pairing: ExtensionPairing; tokenHash: string } | null>;
  /** Moves the pairing's `last_seen_at`; null when it is gone. */
  touch(id: string, lastSeenAt: Date): Promise<ExtensionPairing | null>;
  /** False when no pairing has `id`, such as when another call deleted it first. */
  delete(id: string): Promise<boolean>;
  deleteByUser(userId: string): Promise<void>;
}

export function extensionPairingRepository(db: Orm | Tx): ExtensionPairingRepository {
  const orm = () => ormOf(db);
  return {
    save: async ({ pairedAt, ...pairing }) => {
      const values = { ...pairing, pairedAt, lastSeenAt: pairedAt };
      const [saved] = await orm()
        .insert(extensionPairings)
        .values(values)
        .onConflictDoUpdate({
          target: extensionPairings.userId,
          set: { ...values, id: sql`uuidv7()` },
        })
        .returning({ id: extensionPairings.id });
      return saved!.id;
    },
    findByUser: async (userId) => {
      const [pairing] = await orm()
        .select(columns)
        .from(extensionPairings)
        .where(eq(extensionPairings.userId, userId));
      return pairing ?? null;
    },
    findWithTokenHash: async (id) => {
      const [row] = await orm()
        .select({ ...columns, tokenHash: extensionPairings.tokenHash })
        .from(extensionPairings)
        .where(eq(extensionPairings.id, id));
      if (!row) {
        return null;
      }
      const { tokenHash, ...pairing } = row;
      return { pairing, tokenHash };
    },
    touch: async (id, lastSeenAt) => {
      const [pairing] = await orm()
        .update(extensionPairings)
        .set({ lastSeenAt })
        .where(eq(extensionPairings.id, id))
        .returning(columns);
      return pairing ?? null;
    },
    delete: async (id) => {
      const deleted = await orm()
        .delete(extensionPairings)
        .where(eq(extensionPairings.id, id))
        .returning({ id: extensionPairings.id });
      return deleted.length > 0;
    },
    deleteByUser: async (userId) => {
      await orm().delete(extensionPairings).where(eq(extensionPairings.userId, userId));
    },
  };
}

const columns = {
  id: extensionPairings.id,
  userId: extensionPairings.userId,
  browser: extensionPairings.browser,
  pairedAt: extensionPairings.pairedAt,
  lastSeenAt: extensionPairings.lastSeenAt,
};
