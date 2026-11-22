import { ApplicationError } from "../../applicationError";
import type { Orm, Tx } from "../../db";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";

/** The Google account of the admin who connects Google Workspace at setup. */
export interface GoogleAdmin {
  /** Google's user id, the `sub` of their ID token. */
  googleUserId: string;
  /** Lowercased. */
  email: string;
  name: string;
}

/** The instance's owner, created once by setup. */
export interface OwnerService {
  /** The owner's id and sign-in email, or null before an owner exists. Trusted read: no `ctx`. */
  readOwner: (db: Orm | Tx) => Promise<{ userId: string; email: string } | null>;
  /**
   * Setup's connect step, for the browser holding setup: creates the admin's user with their Google
   * account, makes them the owner, moves setup to the scan and ends the setup session, joining
   * `tx`. Refuses with `OwnerExistsError`, `SetupInProgressError`, or CONFLICT at another step.
   */
  createOwnerAtConnect: (
    ctx: SecurityContext,
    tx: Tx,
    session: { setupToken: string | null; now: Date },
    admin: GoogleAdmin,
  ) => Promise<{ userId: string }>;
}

export function createOwnerService(): OwnerService {
  return {
    readOwner: (db) => instanceRepository(db).readOwner(),
    async createOwnerAtConnect(ctx, tx, { setupToken, now }, admin) {
      ctx.requireSetupHolder();
      const repository = instanceRepository(tx);
      // The row lock makes a concurrent connection wait and then fail with `OwnerExistsError`.
      const current = await repository.lockInstance();
      current.requireHeldSetup(setupToken, now);
      const scan = current.finishConnectStep();
      if (!scan) {
        throw new ApplicationError("CONFLICT", "Google Workspace is already connected.");
      }
      const userId = await repository.createGoogleUser(admin);
      await repository.setOwner(scan.claimOwner(userId).ownerUserId!, scan.step);
      await repository.clearSetupSession();
      return { userId };
    },
  };
}
