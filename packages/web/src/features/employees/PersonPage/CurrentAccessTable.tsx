import type { PersonPageQuery } from "@/__generated__/graphql";
import { AppMark } from "@/components/AppMark";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AccountChangeCell,
  AppAccountStatusCell,
  InviteCell,
  InviteStatusCell,
} from "@/features/apps";
import { t } from "@/i18n";
import { FoundVia } from "@/components/FoundVia";
import { formatSince } from "@/lib/since";

type Props = {
  appAccounts: NonNullable<PersonPageQuery["employee"]>["appAccounts"];
  appInvites: NonNullable<PersonPageQuery["employee"]>["appInvites"];
};

/**
 * A framed table of a person's accounts in approved apps: their status in each app, how each was
 * found and since when, and Disable or Enable where the app's connection can change them. Below,
 * the connected apps they have no account in, with Invite.
 */
export function CurrentAccessTable({ appAccounts, appInvites }: Props) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-12 w-[24%] pl-5 font-normal text-muted-foreground">
              {t("apps.column.app")}
            </TableHead>
            <TableHead className="h-12 w-[14%] font-normal text-muted-foreground">
              {t("people.person.column.inApp")}
            </TableHead>
            <TableHead className="h-12 w-[26%] font-normal text-muted-foreground">
              {t("apps.column.foundVia")}
            </TableHead>
            <TableHead className="h-12 font-normal text-muted-foreground">
              {t("apps.column.since")}
            </TableHead>
            <TableHead className="h-12 pr-5">
              <span className="sr-only">{t("apps.page.column.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {appAccounts.length === 0 && appInvites.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                {t("people.person.noAccess")}
              </TableCell>
            </TableRow>
          )}
          {appAccounts.map((account) => (
            <TableRow key={account.id}>
              <TableCell className="h-[54px] pl-5">
                <span className="flex items-center gap-3 font-medium">
                  <AppMark name={account.app.name} catalogKey={account.app.catalogKey} />
                  {account.app.name}
                </span>
              </TableCell>
              <TableCell>
                <AppAccountStatusCell appUser={account} />
              </TableCell>
              <TableCell>
                <FoundVia findingKinds={account.foundVia} />
              </TableCell>
              <TableCell>{formatSince(account.since)}</TableCell>
              <TableCell className="pr-5">
                <AccountChangeCell appUser={account} />
              </TableCell>
            </TableRow>
          ))}
          {appInvites.map((invite) => (
            <TableRow key={invite.id}>
              <TableCell className="h-[54px] pl-5">
                <span className="flex items-center gap-3 font-medium">
                  <AppMark name={invite.app.name} catalogKey={invite.app.catalogKey} />
                  {invite.app.name}
                </span>
              </TableCell>
              <TableCell>
                <InviteStatusCell appInvite={invite} />
              </TableCell>
              <TableCell />
              <TableCell />
              <TableCell className="pr-5">
                <InviteCell appInvite={invite} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
