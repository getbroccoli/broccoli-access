import { toast } from "sonner";

import {
  KeepExtraAppDocument,
  type PeopleDifferencesQuery,
  PeopleDifferencesDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { AccountChangeCell } from "@/features/apps";
import { t } from "@/i18n";

type Extra = NonNullable<PeopleDifferencesQuery["accessDifferences"]["extra"]>[number];

type Props = {
  app: Extra["app"];
  employee: Extra["employee"];
  accounts: Extra["activeAccounts"];
  isOwner: boolean;
};

/** Keep applies to the person's app once. Disable runs on each account. */
export function ExtraAppActions({ app, employee, accounts, isOwner }: Props) {
  const [keep, { loading }] = usePayloadMutation(KeepExtraAppDocument, {
    refetch: [PeopleDifferencesDocument],
  });
  const onKeep = () =>
    keep({ variables: { input: { appId: app.id, employeeId: employee.id } } }).catch(() =>
      toast.error(t("people.differences.keepFailed")),
    );
  return (
    <div className="flex items-center justify-end gap-2">
      {isOwner && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={t("people.differences.keepLabel", {
            app: app.name,
            name: `${employee.firstName} ${employee.lastName}`,
          })}
          disabled={loading}
          onClick={() => void onKeep()}
        >
          {t("people.differences.keep")}
        </Button>
      )}
      {accounts.map((account) => (
        <AccountChangeCell key={account.id} appUser={account} />
      ))}
    </div>
  );
}
