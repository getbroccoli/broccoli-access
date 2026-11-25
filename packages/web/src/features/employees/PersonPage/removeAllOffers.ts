import type { AppAccountStatus } from "@/__generated__/graphql";

/** An already suspended directory account can leave active access to remove before Offboard ran. */
export function showRemoveAll({
  offboardedAt,
  directoryStatus,
  accountsToRemove,
}: {
  offboardedAt: string | null;
  directoryStatus?: AppAccountStatus;
  accountsToRemove: readonly { status: AppAccountStatus }[];
}): boolean {
  if (!accountsToRemove.length) return false;
  return (
    offboardedAt !== null ||
    (directoryStatus === "SUSPENDED" && activeAccountsToRemove(accountsToRemove).length > 0)
  );
}

/** The removable accounts whose access stays active through Offboard. */
export function activeAccountsToRemove<Account extends { status: AppAccountStatus }>(
  accounts: readonly Account[],
): Account[] {
  return accounts.filter(({ status }) => status === "ACTIVE");
}
