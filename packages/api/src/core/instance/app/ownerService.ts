import { ApplicationError } from "../../applicationError";
import type { Orm, Tx } from "../../db";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";

export interface OwnerUser {
  user: { id: string; email: string };
}

/** The instance's owner, created once by setup. */
export interface OwnerService {
  /** The owner's id and sign-in email, or null before an owner exists. Trusted read: no `ctx`. */
  readOwner: (db: Orm | Tx) => Promise<{ userId: string; email: string } | null>;
  /**
   * Setup's only step: makes the user that `createOwner` creates the owner, for the browser
   * holding setup only, then completes setup and ends the setup session. Refuses with
   * `OwnerExistsError`, `SetupInProgressError`, or CONFLICT once setup is done.
   */
  createOwnerAtSetup: <Owner extends OwnerUser>(
    ctx: SecurityContext,
    tx: Tx,
    session: { token: string | null; now: Date },
    createOwner: () => Promise<Owner>,
  ) => Promise<Owner>;
}

export function createOwnerService(): OwnerService {
  return {
    readOwner: (db) => instanceRepository(db).readOwner(),
    async createOwnerAtSetup(ctx, tx, { token, now }, createOwner) {
      ctx.requireSystem();
      const repository = instanceRepository(tx);
      // The row lock makes a concurrent setup wait and then fail with `OwnerExistsError`.
      const current = await repository.lockInstance();
      current.requireHeldSetup(token, now);
      const done = current.completeOwnerStep();
      if (!done) {
        throw new ApplicationError("CONFLICT", "Setup is already done.");
      }
      const owner = await createOwner();
      await repository.setOwner(done.claimOwner(owner.user.id).ownerUserId!, done.step);
      await repository.clearSetupSession();
      return owner;
    },
  };
}
