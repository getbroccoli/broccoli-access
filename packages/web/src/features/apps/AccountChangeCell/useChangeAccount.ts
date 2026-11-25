import { toast } from "sonner";

import {
  type AccountChangeAction,
  ChangeAccountDocument,
  AppPageDocument,
  PersonPageDocument,
  InviteEmployeeDocument,
} from "@/__generated__/graphql";
import { useCache, usePayloadMutation } from "@/apollo";
import { t } from "@/i18n";

import { forgetPersonApps } from "../cache";

/**
 * What a change is asked for, and how copy names it: the account for Disable and Enable, or the
 * employee and the app for Invite.
 */
export type ChangeTarget = { name: string; app: string } & (
  { accountId: string; onlyIfExtra?: boolean } | { employeeId: string; appId: string }
);

/**
 * Asks for a Disable or Enable of an account, or an Invite of an employee to an app; a refused ask
 * shows a toast. A refused Disable or Enable leaves the row as it was; a refused Invite reads the
 * page again, since what the row offered no longer holds.
 */
export function useChangeAccount(
  refusedMessage: "apps.change.refused" | "people.accounts.changeRefused" = "apps.change.refused",
): {
  changeAccount: (
    target: ChangeTarget,
    action: AccountChangeAction,
    retryOf?: string,
  ) => Promise<boolean>;
  loading: boolean;
} {
  const cache = useCache();
  const [change, changing] = usePayloadMutation(ChangeAccountDocument, {
    refetch: ({ appUser }) => (appUser ? [] : [AppPageDocument, PersonPageDocument]),
  });
  const [invite, inviting] = usePayloadMutation(InviteEmployeeDocument);
  const changeAccount = async (
    target: ChangeTarget,
    action: AccountChangeAction,
    retryOf?: string,
  ) => {
    try {
      if ("accountId" in target) {
        await change({
          variables: {
            input: { id: target.accountId, action, retryOf, onlyIfExtra: target.onlyIfExtra },
          },
        });
      } else {
        await invite({
          variables: { input: { employeeId: target.employeeId, appId: target.appId } },
        });
      }
      return true;
    } catch {
      const refused = "accountId" in target ? refusedMessage : "apps.change.inviteRefused";
      toast.error(
        t(retryOf ? "apps.change.retryRefused" : refused, { name: target.name, app: target.app }),
      );
      if (!("accountId" in target)) forgetPersonApps(cache, target.employeeId);
      return false;
    }
  };
  return { changeAccount, loading: changing.loading || inviting.loading };
}

/** The target of `action` on a row: its account, or for Invite its employee and app. */
export function changeTargetOf(
  {
    id,
    employee,
    app,
  }: {
    id: string;
    employee: { id: string; firstName: string; lastName: string };
    app: { id: string; name: string };
  },
  action: AccountChangeAction,
  onlyIfExtra?: boolean,
): ChangeTarget {
  const named = { name: `${employee.firstName} ${employee.lastName}`, app: app.name };
  return action === "INVITE"
    ? { ...named, employeeId: employee.id, appId: app.id }
    : { ...named, accountId: id, onlyIfExtra: action === "SUSPEND" ? onlyIfExtra : undefined };
}
