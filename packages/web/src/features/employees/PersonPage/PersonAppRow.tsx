import { Link } from "@tanstack/react-router";

import { PersonAppChoiceButton } from "./PersonAppChoiceButton";
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
import { isRoleBlocked } from "./roleBlocked";

type Person = NonNullable<PersonPageQuery["employee"]>;
type Props = {
  row: Person["personApps"]["edges"][number]["node"];
  account: Person["appAccounts"][number] | undefined;
  person: Pick<Person, "id" | "firstName">;
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
  person,
  showEmail,
  first,
  span,
  invite,
  showSources,
}: Props) {
  const roleBlocked = isRoleBlocked(row);
  const removed = row.choice === "REMOVED_FOR_PERSON";
  return (
    <TableRow className={row.roleConflict ? "bg-amber-50/70" : undefined}>
      <TableCell className="h-12 pl-4">
        {first && (
          <span className="flex items-center gap-2.5 font-medium">
            <AppMark name={row.app.name} catalogKey={row.app.catalogKey} />
            <span className={removed ? "line-through" : undefined}>{row.app.name}</span>
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
              <PersonAppRole row={row} employeeId={person.id} />
            </TableCell>
            <TableCell rowSpan={span}>{sourceOf(row)}</TableCell>
          </>
        )
      ) : (
        <>
          <TableCell>{account && <FoundVia findingKinds={account.foundVia} />}</TableCell>
          <TableCell>{account && formatSince(account.since)}</TableCell>
        </>
      )}
      <TableCell>
        {first && removed && !row.state && (
          <StatusBadge tone="muted">{t("people.person.notGiven")}</StatusBadge>
        )}
        {first && row.state === "MISSING" && (
          <StatusBadge tone="warning">{t("people.person.missing")}</StatusBadge>
        )}
        {first && row.state === "APP_NOT_CONNECTED" && (
          <Link
            to="/apps/$appId"
            params={{ appId: row.app.id }}
            className="rounded-full hover:opacity-80"
          >
            <StatusBadge tone="muted">{t("people.person.notConnected")}</StatusBadge>
          </Link>
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
          ((!row.state && !removed) ||
            (row.state !== "INVITED" && invite.latestInvite?.status === "FAILED")) && (
            <InviteStatusCell appInvite={invite} roleBlocked={roleBlocked} />
          )}
      </TableCell>
      <TableCell className="pr-4">
        <div className="flex items-center justify-end gap-2">
          {account && <AccountChangeCell appUser={account} />}
          {invite && (row.state !== "INVITED" || invite.latestInvite?.status === "RUNNING") && (
            <InviteCell
              appInvite={invite}
              roleBlocked={roleBlocked}
              expectedRole={
                row.role
                  ? row.app.roles.find(({ key }) => key === row.role)?.name
                  : t("apps.change.appDefault")
              }
            />
          )}
          {first && <PersonAppChoiceButton row={row} person={person} />}
        </div>
      </TableCell>
    </TableRow>
  );
}

/** Where the app comes from: the owner's own choice for this person, else their templates. */
function sourceOf(row: Props["row"]) {
  if (row.choice === "REMOVED_FOR_PERSON") return t("people.person.removedByYou");
  if (row.choice === "ADDED_FOR_PERSON") return t("people.person.addedByYou");
  return row.templates.map((template) => template.name).join(", ") || t("people.person.noTemplate");
}
