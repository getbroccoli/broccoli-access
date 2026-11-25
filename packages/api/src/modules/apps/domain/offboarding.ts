import type { AccountAction, AccountStatus } from "../../../core/connectors";
import type { AccountChangeAction } from "./accountChange";

/** What decides a person's offboarding: their accounts and the apps that show them Invited. */
export interface OffboardingFacts {
  /** Their accounts in approved apps, by app name. */
  accounts: readonly OffboardingAccount[];
  /** The apps whose invite row shows them Invited, by app name. */
  invitedAppIds: readonly string[];
  /** The apps where an invite of theirs is running, by app name. */
  invitingAppIds: readonly string[];
}

export interface OffboardingAccount {
  id: string;
  appId: string;
  status: AccountStatus;
  /** Whether it is their account in the directory, such as Google Workspace. */
  isDirectory: boolean;
  /** Disable or Enable when offered now (`offeredChange`). */
  offeredChange: AccountAction | null;
  /** Whether Remove is available for this account after Offboard. */
  offersRemove: boolean;
  offersReconnect: boolean;
  isConnectionUser: boolean;
  /** The action of its running change; null without one. */
  runningChange: AccountChangeAction | null;
}

/** What Offboard disables now, and what is left to the owner. */
export interface OffboardingPlan {
  /** The directory account first, then by app name. */
  accountIdsToDisable: string[];
  /** Each group by app name: the accounts, then the pending invitations, then the running invites. */
  byHandWork: OffboardingByHandWork[];
}

export interface OffboardingByHandWork {
  appId: string;
  reason: OffboardingByHandReason;
}

/** Why Broccoli Access cannot take an app away from the person itself. */
export const OFFBOARDING_BY_HAND_REASONS = [
  "app_has_no_connection",
  "invitation_is_pending",
  "connection_needs_reconnect",
  "account_is_connection_user",
  "change_is_running",
] as const;

export type OffboardingByHandReason = (typeof OFFBOARDING_BY_HAND_REASONS)[number];

/**
 * Offboard disables every active account that offers Disable, the directory account first so the
 * person can no longer sign in anywhere with it. Active accounts offering Remove are left to
 * Remove all. Other active accounts, pending invitations, and a running Enable or Invite need
 * the owner's work by hand. A suspended account, and one being disabled or removed, needs nothing.
 */
export function offboardingPlanOf({
  accounts,
  invitedAppIds,
  invitingAppIds,
}: OffboardingFacts): OffboardingPlan {
  const toDisable = accounts.filter(
    (account) => isIdleAndActive(account) && account.offeredChange === "suspend",
  );
  return {
    accountIdsToDisable: [
      ...toDisable.filter(({ isDirectory }) => isDirectory),
      ...toDisable.filter(({ isDirectory }) => !isDirectory),
    ].map(({ id }) => id),
    byHandWork: [
      ...accounts.flatMap((account) => {
        const reason = needsOwner(account);
        return reason ? [{ appId: account.appId, reason }] : [];
      }),
      ...invitedAppIds.map((appId) => ({ appId, reason: "invitation_is_pending" as const })),
      ...invitingAppIds.map((appId) => ({ appId, reason: "change_is_running" as const })),
    ],
  };
}

function isIdleAndActive({ status, runningChange }: OffboardingAccount): boolean {
  return status === "active" && runningChange === null;
}

/** Why the account is the owner's work by hand; null when it is not. */
function needsOwner(account: OffboardingAccount): OffboardingByHandReason | null {
  if (account.runningChange === "reactivate") {
    return "change_is_running";
  }
  if (!isIdleAndActive(account) || account.offeredChange === "suspend" || account.offersRemove) {
    return null;
  }
  if (account.isConnectionUser) {
    return "account_is_connection_user";
  }
  return account.offersReconnect ? "connection_needs_reconnect" : "app_has_no_connection";
}
