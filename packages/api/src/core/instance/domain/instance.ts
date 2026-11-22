import type { MailSource } from "./mailSource";
import { OwnerExistsError, type SetupStep } from "./setup";
import { holdsSetup, SetupInProgressError, type SetupSession } from "./setupSession";

/** The stored facts needed to restore an instance; secrets are read separately. */
export interface InstanceState {
  ownerUserId: string | null;
  step: SetupStep;
  setupSession: SetupSession | null;
  /** Null until the owner chooses. */
  mailSource: MailSource | null;
}

/** An immutable instance with its setup transitions and access rules; callers persist changes in a transaction. */
export class Instance {
  readonly #state: InstanceState;

  constructor(state: InstanceState) {
    this.#state = structuredClone(state);
  }

  get ownerUserId(): string | null {
    return this.#state.ownerUserId;
  }

  get step(): SetupStep {
    return this.#state.step;
  }

  get setupSession(): SetupSession | null {
    return structuredClone(this.#state.setupSession);
  }

  get mailSource(): MailSource | null {
    return this.#state.mailSource;
  }

  requireUnclaimedOwner(): void {
    if (this.ownerUserId) {
      throw new OwnerExistsError();
    }
  }

  /** Refuses a browser that does not hold live setup, including after an owner was claimed. */
  requireHeldSetup(token: string | null, now: Date): void {
    this.requireUnclaimedOwner();
    if (!this.#state.setupSession || !holdsSetup(this.#state.setupSession, token, now)) {
      throw new SetupInProgressError();
    }
  }

  claimOwner(userId: string): Instance {
    this.requireUnclaimedOwner();
    return new Instance({ ...this.#state, ownerUserId: userId });
  }

  completeOwnerStep(): Instance | null {
    return this.step === "owner" ? new Instance({ ...this.#state, step: "done" }) : null;
  }
}
