import { eq } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import type { IntegrationUser } from "../domain";
import { integrationUser } from "./integrationUserTable";

/** The integration user in Postgres, through the pool or inside a transaction. */
export interface IntegrationUserRepository {
  /** The integration user without its secrets, or null before it is created. */
  find(): Promise<IntegrationUser | null>;
  /** Stores the integration user with its secrets encrypted; false when one is stored already. */
  insert(created: IntegrationUser & { encryptedSecrets: string }): Promise<boolean>;
  /** Its secrets as stored, encrypted; null before it is created. */
  findEncryptedSecrets(): Promise<string | null>;
  replaceEncryptedSecrets(encryptedSecrets: string): Promise<void>;
}

export function integrationUserRepository(db: Orm | Tx): IntegrationUserRepository {
  const orm = () => ormOf(db);
  return {
    find: async () => {
      const [found] = await orm()
        .select({
          email: integrationUser.email,
          googleUserId: integrationUser.googleUserId,
          createdBy: integrationUser.createdBy,
          createdAt: integrationUser.createdAt,
        })
        .from(integrationUser);
      return found ?? null;
    },
    insert: async (created) => {
      const inserted = await orm()
        .insert(integrationUser)
        .values(created)
        .onConflictDoNothing()
        .returning({ id: integrationUser.id });
      return inserted.length > 0;
    },
    findEncryptedSecrets: async () => {
      const [found] = await orm()
        .select({ encryptedSecrets: integrationUser.encryptedSecrets })
        .from(integrationUser);
      return found?.encryptedSecrets ?? null;
    },
    replaceEncryptedSecrets: async (encryptedSecrets) => {
      await orm()
        .update(integrationUser)
        .set({ encryptedSecrets })
        .where(eq(integrationUser.id, true));
    },
  };
}
