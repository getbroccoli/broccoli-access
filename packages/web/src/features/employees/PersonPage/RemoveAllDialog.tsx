import { useState } from "react";
import { toast } from "sonner";

import {
  PersonPageDocument,
  type PersonPageQuery,
  RemoveEmployeeAccountsDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

type Person = NonNullable<PersonPageQuery["employee"]>;

/**
 * "Remove all…" on an offboarded person: one confirmation listing the disabled accounts it removes,
 * then a Remove for each, whose results show on their rows.
 */
export function RemoveAllDialog({ person }: { person: Person }) {
  // The accounts listed when the dialog opened: a poll adding one meanwhile is never confirmed unseen.
  const [accounts, setAccounts] = useState<Person["offboarding"]["accountsToRemove"] | null>(null);
  const [removeAll, removing] = usePayloadMutation(RemoveEmployeeAccountsDocument, {
    refetch: [PersonPageDocument],
  });
  const confirm = async () => {
    const listed = accounts ?? [];
    setAccounts(null);
    try {
      const accountIds = listed.map(({ id }) => id);
      await removeAll({ variables: { input: { employeeId: person.id, accountIds } } });
    } catch {
      toast.error(t("people.offboard.removeAllFailed"));
    }
  };
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="text-red-800"
        disabled={removing.loading}
        onClick={() => setAccounts(person.offboarding.accountsToRemove)}
      >
        {t("people.offboard.removeAll")}
      </Button>
      <AlertDialog open={accounts !== null} onOpenChange={(open) => !open && setAccounts(null)}>
        <AlertDialogContent className="gap-[18px] p-6 data-[size=default]:sm:max-w-[560px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-semibold">
              {t("people.offboard.removeAllTitle", {
                name: `${person.firstName} ${person.lastName}`,
              })}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-xl border border-border text-sm">
            {(accounts ?? []).map(({ id, email, app }) => (
              <li key={id} className="flex gap-3 px-4 py-3">
                <span className="w-32 font-semibold">{app.name}</span>
                <span className="break-words text-muted-foreground">{email}</span>
              </li>
            ))}
          </ul>
          <AlertDialogDescription className="rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 font-bold text-red-900">
            {t("apps.change.removeWarning")}
          </AlertDialogDescription>
          <AlertDialogFooter className="m-0 border-0 bg-transparent p-0">
            <AlertDialogCancel>{t("apps.change.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-800 text-white hover:bg-red-900"
              onClick={() => void confirm()}
            >
              {t("people.offboard.removeAllConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
