import type { AccountChangeError } from "./accountChange";

/** What Provision does for one of a person's apps: Invite, Enable, or a change the owner makes by hand. */
export type ProvisionAction = "invite" | "reactivate" | "give_by_hand";

/** What decides Provision's action for one of a person's apps. */
export interface ProvisionFacts {
  /** Whether it is one of the person's apps they have no active account and no pending invitation in. */
  missing: boolean;
  /** Whether the person's account in the directory is active. */
  activeInDirectory: boolean;
  /** Whether the app has a connection. */
  connected: boolean;
  /** Whether an account of theirs in the app offers Enable now. */
  enableOffered: boolean;
  /** Whether their row in the app offers Invite now. */
  inviteOffered: boolean;
  /** Whether a change in the app, which has no connection, already waits for "I did it by hand". */
  waitsByHand: boolean;
  /** Why their latest Invite or Enable in the app failed; null when it did not. */
  lastFailure: AccountChangeError | null;
}

/**
 * Provision's action for a missing app of a person active in the directory: Enable where their
 * disabled account offers it, else Invite where it is offered, and by hand without a connection,
 * unless that already waits. Null where Provision does nothing now, such as after the app refused
 * the change or no longer found the account.
 */
export function provisionActionOf(facts: ProvisionFacts): ProvisionAction | null {
  if (!facts.missing || !facts.activeInDirectory) {
    return null;
  }
  if (!facts.connected) {
    return facts.waitsByHand ? null : "give_by_hand";
  }
  // Trying again cannot help: the owner settles it on the app's own row.
  if (facts.lastFailure === "not_allowed" || facts.lastFailure === "account_not_found") {
    return null;
  }
  if (facts.enableOffered) {
    return "reactivate";
  }
  return facts.inviteOffered ? "invite" : null;
}
