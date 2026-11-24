import { CaretDown } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { LinkAccountDocument, type AccountsWithoutPersonQuery } from "@/__generated__/graphql";
import { PayloadFailure, usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { t } from "@/i18n";

import { removeLinkedAccount } from "../cache";
import { LinkAccountDialog } from "./LinkAccountDialog";

type Accounts = NonNullable<AccountsWithoutPersonQuery["accountsWithoutPerson"]>;
type Account = Accounts["edges"][number]["node"];
type Person = NonNullable<Account["suggestedEmployee"]>;

/** The owner's accounts to link, with a shortcut for a suggested employee. */
export function AccountsWithoutPersonTable({
  accounts,
  loading,
  loadMore,
  refresh,
  refreshCounts,
}: {
  accounts: Accounts;
  loading: boolean;
  loadMore: () => void;
  refresh: () => Promise<unknown>;
  refreshCounts: () => void;
}) {
  const [chosenId, setChoosing] = useState<string | null>(null);
  const choosing = accounts.edges.find(({ node }) => node.id === chosenId)?.node;
  const [link, mutation] = usePayloadMutation(LinkAccountDocument, {
    update: (cache, { data }) => {
      const id = data?.apps.linkAccount.appUser?.id;
      if (id) removeLinkedAccount(cache, id);
    },
  });

  async function linkTo(account: Account, person: Person) {
    try {
      await link({ variables: { input: { appAccountId: account.id, employeeId: person.id } } });
      setChoosing(null);
      refreshCounts();
      toast.success(
        t("people.accounts.linked", { name: `${person.firstName} ${person.lastName}` }),
      );
    } catch (error) {
      if (error instanceof PayloadFailure) {
        setChoosing(null);
        toast.error(t("people.accounts.unavailable"));
        await refresh();
        return;
      }
      toast.error(t("people.accounts.linkFailed"));
    }
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table className="min-w-[660px]">
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">{t("people.accounts.account")}</TableHead>
            <TableHead>{t("apps.column.app")}</TableHead>
            <TableHead>{t("people.accounts.looksLike")}</TableHead>
            <TableHead>
              <span className="sr-only">{t("apps.page.column.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.edges.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                {t("people.accounts.empty")}
              </TableCell>
            </TableRow>
          )}
          {accounts.edges.map(({ node: account }) => {
            const person = account.suggestedEmployee;
            return (
              <TableRow key={account.id}>
                <TableCell className="h-[60px] pl-4">
                  <span className="block font-semibold">{account.email}</span>
                  {account.displayName && (
                    <span className="text-xs text-muted-foreground">{account.displayName}</span>
                  )}
                </TableCell>
                <TableCell className="font-medium">{account.app.name}</TableCell>
                <TableCell>
                  <SuggestedPerson person={person} />
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <span className="inline-flex gap-1.5">
                    {person && (
                      <Button
                        size="sm"
                        disabled={mutation.loading || loading}
                        onClick={() => void linkTo(account, person)}
                      >
                        {t("people.accounts.link")}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      aria-haspopup="dialog"
                      disabled={mutation.loading || loading}
                      onClick={() => setChoosing(account.id)}
                    >
                      {t("people.accounts.decide")}
                      <CaretDown aria-hidden />
                    </Button>
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {accounts.pageInfo.hasNextPage && (
        <Button variant="ghost" disabled={loading || mutation.loading} onClick={loadMore}>
          {t("people.accounts.more")}
        </Button>
      )}
      {choosing && (
        <LinkAccountDialog
          email={choosing.email}
          linking={mutation.loading}
          onClose={() => setChoosing(null)}
          onLink={(person) => void linkTo(choosing, person)}
        />
      )}
    </div>
  );
}

function SuggestedPerson({ person }: { person: Person | null }) {
  if (!person) return t("people.accounts.nobody");
  return (
    <Link to="/people/$employeeId" params={{ employeeId: person.id }} className="hover:underline">
      {person.firstName} {person.lastName}
      <span className="block text-xs text-muted-foreground">{person.email}</span>
    </Link>
  );
}
