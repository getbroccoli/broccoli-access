import { eq } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import type { ExtensionPairing } from "../domain";
import { extensionPairings } from "./extensionPairingsTable";

/** Extension pairings in Postgres, through the pool or inside a transaction. */
export interface ExtensionPairingRepository {
  /** Pairs the user's browser, replacing their pairing and its token hash; keeps the row's id. */
  save(pairing: {
    userId: string;
    tokenHash: string;
    browser: string;
    pairedAt: Date;
  }): Promise<ExtensionPairing>;
  findByUser(userId: string): Promise<ExtensionPairing | null>;
  /** The pairing with its token hash, to check a token against. */
  findWithTokenHash(id: string): Promise<{ pairing: ExtensionPairing; tokenHash: string } | null>;
  /** Moves the pairing's `last_seen_at`; null when it is gone. */
  touch(id: string, lastSeenAt: Date): Promise<ExtensionPairing | null>;
  delete(id: string): Promise<void>;
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
        .onConflictDoUpdate({ target: extensionPairings.userId, set: values })
        .returning(columns);
      return saved!;
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
      await orm().delete(extensionPairings).where(eq(extensionPairings.id, id));
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
