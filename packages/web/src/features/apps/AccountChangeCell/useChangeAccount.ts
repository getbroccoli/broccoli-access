import { toast } from "sonner";

import {
  type AccountChangeAction,
  ChangeAccountDocument,
  InviteEmployeeDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { t } from "@/i18n";

/**
 * What a change is asked for, and how copy names it: the account for Disable and Enable, or the
 * employee and the app for Invite.
 */
export type ChangeTarget = { name: string; app: string } & (
  { accountId: string } | { employeeId: string; appId: string }
);

/**
 * Asks for a Disable or Enable of an account, or an Invite of an employee to an app; a refused ask
 * shows a toast, and the row keeps showing what it showed.
 */
export function useChangeAccount(): {
  changeAccount: (target: ChangeTarget, action: AccountChangeAction) => Promise<void>;
  loading: boolean;
} {
  const [change, changing] = usePayloadMutation(ChangeAccountDocument);
  const [invite, inviting] = usePayloadMutation(InviteEmployeeDocument);
  const changeAccount = async (target: ChangeTarget, action: AccountChangeAction) => {
    try {
      if ("accountId" in target) {
        await change({ variables: { input: { id: target.accountId, action } } });
      } else {
        await invite({
          variables: { input: { employeeId: target.employeeId, appId: target.appId } },
        });
      }
    } catch {
      const refused = "accountId" in target ? "apps.change.refused" : "apps.change.inviteRefused";
      toast.error(t(refused, { name: target.name, app: target.app }));
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
): ChangeTarget {
  const named = { name: `${employee.firstName} ${employee.lastName}`, app: app.name };
  return action === "INVITE"
    ? { ...named, employeeId: employee.id, appId: app.id }
    : { ...named, accountId: id };
}
