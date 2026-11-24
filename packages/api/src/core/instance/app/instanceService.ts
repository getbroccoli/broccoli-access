import type { SecurityContext } from "../../security";
import type { Orm, Tx } from "../../db";
import { instanceRepository } from "../db";
import type { Instance } from "../domain";

/** The instance's stored state, which auth, setup and the modules read. */
export interface InstanceService {
  /** The instance as stored, through the pool or joining `tx`; callers take the fields they need. Trusted read: no `ctx`. */
  readInstance: (db: Orm | Tx) => Promise<Instance>;
  /** Remembers the first origin under the instance lock; later calls keep it. */
  rememberPublicOrigin: (ctx: SecurityContext, tx: Tx, origin: string) => Promise<string>;
}

export function createInstanceService(): InstanceService {
  return {
    readInstance: (db) => instanceRepository(db).readInstance(),
    async rememberPublicOrigin(ctx, tx, origin) {
      if (!ctx.isSetupHolder) ctx.require("MANAGE_WORKSPACE");
      const repository = instanceRepository(tx);
      const instance = await repository.lockInstance();
      if (ctx.isSetupHolder) instance.requireUnclaimedOwner();
      if (instance.publicOrigin) return instance.publicOrigin;
      const publicOrigin = new URL(origin).origin;
      await repository.savePublicOrigin(publicOrigin);
      return publicOrigin;
    },
  };
}
