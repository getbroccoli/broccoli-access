/**
 * Where a new instance is in its first-run flow: the Google admin's consent at `connect_google`
 * makes them the owner, then their workspace is scanned and they select its apps.
 */
export const SETUP_STEPS = ["connect_google", "scan", "select_apps", "done"] as const;

export type SetupStep = (typeof SETUP_STEPS)[number];

/** An instance has one owner; a second claim is refused. */
export class OwnerExistsError extends Error {
  constructor() {
    super("The instance already has an owner");
    this.name = "OwnerExistsError";
  }
}
