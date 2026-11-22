import { ApplicationError } from "../../applicationError";
import type { Tx } from "../../db";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";

/** Setup's steps once the owner exists: the scan, then selecting the company's apps. */
export interface SetupStepService {
  /**
   * Moves setup from the scan to selecting the apps, joining `tx`; does nothing at any other step.
   * Returns whether it moved. System only.
   */
  finishScanStep: (ctx: SecurityContext, tx: Tx) => Promise<boolean>;
  /**
   * Finishes setup from selecting the apps, joining `tx`; refuses with CONFLICT at any other step.
   * Needs MANAGE_WORKSPACE.
   */
  finishSelectAppsStep: (ctx: SecurityContext, tx: Tx) => Promise<void>;
}

export function createSetupStepService(): SetupStepService {
  return {
    async finishScanStep(ctx, tx) {
      ctx.requireSystem();
      return instanceRepository(tx).advanceStep("scan", "select_apps");
    },
    async finishSelectAppsStep(ctx, tx) {
      ctx.require("MANAGE_WORKSPACE");
      if (!(await instanceRepository(tx).advanceStep("select_apps", "done"))) {
        throw new ApplicationError("CONFLICT", "Setup is not at the step that selects apps.");
      }
    },
  };
}
