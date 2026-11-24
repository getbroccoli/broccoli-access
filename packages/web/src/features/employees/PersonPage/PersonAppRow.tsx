import type { PersonPageQuery } from "@/__generated__/graphql";
import { AppMark } from "@/components/AppMark";
import { FoundVia } from "@/components/FoundVia";
import { TableRow, TableCell } from "@/components/ui/table";
import {
  AccountChangeCell,
  AppAccountStatusCell,
  InviteCell,
  InviteStatusCell,
  StatusBadge,
} from "@/features/apps";
import { t } from "@/i18n";
import { formatSince } from "@/lib/since";

type Person = NonNullable<PersonPageQuery["employee"]>;
type Props = {
  row: Person["templateApps"][number];
  held: Person["appAccounts"];
  invite: Person["appInvites"][number] | undefined;
  showSources: boolean;
};

/** The role, sources, status and account actions for one app. */
export function PersonAppRow({ row, held, invite, showSources }: Props) {
  const account = held[0];
  return (
    <TableRow>
      <TableCell className="h-12 pl-4">
        <span className="flex items-center gap-2.5 font-medium">
          <AppMark name={row.app.name} catalogKey={row.app.catalogKey} />
          {row.app.name}
        </span>
      </TableCell>
      {showSources ? (
        <>
          <TableCell>{row.role ?? "—"}</TableCell>
          <TableCell>
            {row.templates.map((template) => template.name).join(", ") ||
              t("people.person.noTemplate")}
          </TableCell>
        </>
      ) : (
        <>
          <TableCell>{account && <FoundVia findingKinds={account.foundVia} />}</TableCell>
          <TableCell>{account && formatSince(account.since)}</TableCell>
        </>
      )}
      <TableCell>
        {row.state === "MISSING" && (
          <StatusBadge tone="warning">{t("people.person.missing")}</StatusBadge>
        )}
        {row.state === "EXTRA" && (
          <StatusBadge tone="extra">{t("people.person.extra")}</StatusBadge>
        )}
        {row.state === "INVITED" && invite?.invitedAt && (
          <StatusBadge tone="invited">
            {t("apps.change.invitedOn", {
              day: formatSince({ at: invite.invitedAt, before: false }),
            })}
          </StatusBadge>
        )}
        {held.map(
          (account) =>
            (account.latestChange?.status === "FAILED" ||
              row.state === "ACTIVE" ||
              row.state === "SUSPENDED") && (
              <AppAccountStatusCell key={account.id} appUser={account} />
            ),
        )}
        {!held.length && row.state === "ACTIVE" && (
          <StatusBadge tone="active">{t("people.status.active")}</StatusBadge>
        )}
        {!held.length && row.state === "SUSPENDED" && (
          <StatusBadge tone="muted">{t("apps.page.inApp.disabled")}</StatusBadge>
        )}
        {invite &&
          (!row.state || (row.state !== "INVITED" && invite.latestInvite?.status === "FAILED")) && (
            <InviteStatusCell appInvite={invite} />
          )}
      </TableCell>
      <TableCell className="pr-4 text-right">
        {row.state !== "EXTRA" &&
          held.map((account) => <AccountChangeCell key={account.id} appUser={account} />)}
        {invite && (row.state !== "INVITED" || invite.latestInvite?.status === "RUNNING") && (
          <InviteCell appInvite={invite} />
        )}
      </TableCell>
    </TableRow>
  );
}
