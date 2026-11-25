import type { AccountChangeAction, ActivityFailedChangeQuery } from "@/__generated__/graphql";

type FailedChange = Pick<
  NonNullable<ActivityFailedChangeQuery["accountChange"]>,
  "id" | "action" | "email" | "employee"
> & { app: { id: string } };

/**
 * The row whose latest change this is, which Try again and I did it by hand act on: the person's
 * account with the change's email, or their invite row; undefined once a later change replaced it.
 */
export function failedChangeRow({ id, action, email, app, employee }: FailedChange) {
  if (!employee) return undefined;
  if (action === "INVITE") {
    const invite = employee.appInvites.find((row) => row.app.id === app.id);
    if (invite?.latestInvite?.id !== id) return undefined;
    const offeredChange: AccountChangeAction | null = invite.offered ? "INVITE" : null;
    return { id: invite.id, offeredChange };
  }
  const accounts = [
    ...employee.appAccounts,
    ...(employee.directoryAccount ? [employee.directoryAccount] : []),
  ];
  const account = accounts.find((row) => row.app.id === app.id && row.email === email);
  if (account?.latestChange?.id !== id) return undefined;
  return {
    id: account.id,
    offeredChange: account.offeredChange ?? null,
    offersRemove: account.offersRemove,
  };
}
