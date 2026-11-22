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
import { t } from "@/i18n";
import { FoundVia } from "@/components/FoundVia";
import { formatSince } from "@/lib/since";

type Props = {
  currentAccess: NonNullable<PersonPageQuery["employee"]>["currentAccess"];
};

/** A framed table of the approved apps a person has an account in, how each was found and since when. */
export function CurrentAccessTable({ currentAccess }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-12 w-[30%] pl-5 font-normal text-muted-foreground">
              {t("apps.column.app")}
            </TableHead>
            <TableHead className="h-12 w-[30%] font-normal text-muted-foreground">
              {t("apps.column.foundVia")}
            </TableHead>
            <TableHead className="h-12 font-normal text-muted-foreground">
              {t("apps.column.since")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {currentAccess.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                {t("people.person.noAccess")}
              </TableCell>
            </TableRow>
          )}
          {currentAccess.map(({ appName, catalogKey, foundVia, since }) => (
            <TableRow key={appName}>
              <TableCell className="h-[54px] pl-5">
                <span className="flex items-center gap-3 font-medium">
                  <AppMark name={appName} catalogKey={catalogKey} />
                  {appName}
                </span>
              </TableCell>
              <TableCell>
                <FoundVia findingKinds={foundVia} />
              </TableCell>
              <TableCell>{formatSince(since)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
