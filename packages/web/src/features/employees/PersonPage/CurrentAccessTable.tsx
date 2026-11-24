import type { PersonPageQuery } from "@/__generated__/graphql";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { t } from "@/i18n";
import { PersonAppRow } from "./PersonAppRow";

type Person = NonNullable<PersonPageQuery["employee"]>;

/** The person's expected and actual apps, with the existing controls for their accounts and invitations. */
export function CurrentAccessTable({ person }: { person: Person }) {
  const accounts = Map.groupBy(person.appAccounts, (account) => account.app.id);
  const invites = new Map(person.appInvites.map((invite) => [invite.app.id, invite]));
  const showSources =
    person.templates.length > 0 || person.templateApps.some((row) => row.state === "EXTRA");
  const rows = person.templateApps.toSorted((a, b) => a.app.name.localeCompare(b.app.name));
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-1/4 pl-4 font-normal text-muted-foreground">
              {t("apps.column.app")}
            </TableHead>
            {showSources ? (
              <>
                <TableHead className="w-1/4 font-normal text-muted-foreground">
                  {t("people.person.role")}
                </TableHead>
                <TableHead className="w-[17%] font-normal text-muted-foreground">
                  {t("people.person.from")}
                </TableHead>
              </>
            ) : (
              <>
                <TableHead>{t("apps.column.foundVia")}</TableHead>
                <TableHead>{t("apps.column.since")}</TableHead>
              </>
            )}
            <TableHead className="font-normal text-muted-foreground">
              {t("people.person.column.inApp")}
            </TableHead>
            <TableHead>
              <span className="sr-only">{t("apps.page.column.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!rows.length && (
            <TableRow>
              <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                {t("people.person.noAccess")}
              </TableCell>
            </TableRow>
          )}
          {rows.map((row) => (
            <PersonAppRow
              key={row.app.id}
              row={row}
              held={accounts.get(row.app.id) ?? []}
              invite={invites.get(row.app.id)}
              showSources={showSources}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
