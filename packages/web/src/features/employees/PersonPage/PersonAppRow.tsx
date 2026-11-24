import { PersonAppRole } from "./PersonAppRole";
import type { PersonPageQuery } from "@/__generated__/graphql";
import { AppMark } from "@/components/AppMark";
import { FoundVia } from "@/components/FoundVia";
import { TableRow, TableCell } from "@/components/ui/table";
import {
  AccountChangeCell,
  showsCouldntChange,
  AppAccountStatusCell,
  InviteCell,
  InviteStatusCell,
  StatusBadge,
} from "@/features/apps";
import { t } from "@/i18n";
import { formatSince } from "@/lib/since";

type Person = NonNullable<PersonPageQuery["employee"]>;
type Props = {
  row: Person["personApps"]["edges"][number]["node"];
  account: Person["appAccounts"][number] | undefined;
  employeeId: string;
  showEmail: boolean;
  first: boolean;
  span: number;
  invite: Person["appInvites"][number] | undefined;
  showSources: boolean;
};

/** The role, sources, status and account actions for one app. */
export function PersonAppRow({
  row,
  account,
  employeeId,
  showEmail,
  first,
  span,
  invite,
  showSources,
}: Props) {
  const retiredRole = row.role != null && !row.app.roles.some(({ key }) => key === row.role);
  const roleBlocked = row.roleConflict || retiredRole;
  return (
    <TableRow className={row.roleConflict ? "bg-amber-50/70" : undefined}>
      <TableCell className="h-12 pl-4">
        {first && (
          <span className="flex items-center gap-2.5 font-medium">
            <AppMark name={row.app.name} catalogKey={row.app.catalogKey} />
            {row.app.name}
          </span>
        )}
        {showEmail && (
          <span className="block pl-8 text-xs text-muted-foreground">{account?.email}</span>
        )}
      </TableCell>
      {showSources ? (
        first && (
          <>
            <TableCell rowSpan={span}>
              <PersonAppRole row={row} employeeId={employeeId} />
            </TableCell>
            <TableCell rowSpan={span}>
              {row.templates.map((template) => template.name).join(", ") ||
                t("people.person.noTemplate")}
            </TableCell>
          </>
        )
      ) : (
        <>
          <TableCell>{account && <FoundVia findingKinds={account.foundVia} />}</TableCell>
          <TableCell>{account && formatSince(account.since)}</TableCell>
        </>
      )}
      <TableCell>
        {first && row.state === "MISSING" && (
          <StatusBadge tone="warning">{t("people.person.missing")}</StatusBadge>
        )}
        {first && row.state === "EXTRA" && (
          <StatusBadge tone="extra">{t("people.person.extra")}</StatusBadge>
        )}
        {row.state === "INVITED" && invite?.invitedAt && (
          <StatusBadge tone="invited">
            {t("apps.change.invitedOn", {
              day: formatSince({ at: invite.invitedAt, before: false }),
            })}
          </StatusBadge>
        )}
        {account &&
          (span > 1 ||
            showsCouldntChange(account) ||
            row.state === "ACTIVE" ||
            row.state === "SUSPENDED") && <AppAccountStatusCell appUser={account} />}
        {!account && row.state === "ACTIVE" && (
          <StatusBadge tone="active">{t("people.status.active")}</StatusBadge>
        )}
        {((!account && row.state === "SUSPENDED") ||
          (span === 1 && row.state === "MISSING" && row.accountStatus === "SUSPENDED")) && (
          <StatusBadge tone="muted">{t("apps.page.inApp.disabled")}</StatusBadge>
        )}
        {invite &&
          (!row.state || (row.state !== "INVITED" && invite.latestInvite?.status === "FAILED")) && (
            <InviteStatusCell appInvite={invite} roleBlocked={roleBlocked} />
          )}
      </TableCell>
      <TableCell className="pr-4 text-right">
        {account && <AccountChangeCell appUser={account} />}
        {invite && (row.state !== "INVITED" || invite.latestInvite?.status === "RUNNING") && (
          <InviteCell appInvite={invite} roleBlocked={roleBlocked} />
        )}
      </TableCell>
    </TableRow>
  );
}
