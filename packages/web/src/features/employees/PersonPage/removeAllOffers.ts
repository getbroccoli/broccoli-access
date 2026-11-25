import type { AppAccountStatus } from "@/__generated__/graphql";

/** An already suspended directory account can leave active access to remove before Offboard ran. */
export function showRemoveAll(
  offboardedAt: string | null,
  person: {
    directoryAccount?: { status: AppAccountStatus } | null;
    offboarding: { accountsToRemove: readonly { status: AppAccountStatus }[] };
  },
): boolean {
  const { accountsToRemove } = person.offboarding;
  if (!accountsToRemove.length) return false;
  return (
    offboardedAt !== null ||
    (person.directoryAccount?.status === "SUSPENDED" &&
      activeAccountsToRemove(accountsToRemove).length > 0)
  );
}

/** The removable accounts whose access stays active through Offboard. */
export function activeAccountsToRemove<Account extends { status: AppAccountStatus }>(
  accounts: readonly Account[],
): Account[] {
  return accounts.filter(({ status }) => status === "ACTIVE");
}
