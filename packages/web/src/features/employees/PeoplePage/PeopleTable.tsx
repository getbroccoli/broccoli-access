import { useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { t } from "@/i18n";

import { PersonCell } from "./PersonCell";
import type { PersonRow } from "./personRow";
import { StatusBadge } from "./StatusBadge";

/** How many people show before "Show n more": a first look at those who need attention. */
const FIRST_ROWS = 10;

type Props = {
  people: readonly PersonRow[];
  /** The apps column's heading, which names what the tab lists. */
  appsHeader: string;
  /** Shown when there are no people. */
  emptyState: string;
};

/** A framed table of people with their status and apps, the first ones only until asked for all. */
export function PeopleTable({ people, appsHeader, emptyState }: Props) {
  const [showsAll, setShowsAll] = useState(false);
  const shown = showsAll ? people : people.slice(0, FIRST_ROWS);
  const hiddenCount = people.length - shown.length;

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-12 pl-5 font-normal text-muted-foreground">
              {t("people.column.person")}
            </TableHead>
            <TableHead className="h-12 w-[22%] font-normal text-muted-foreground">
              {t("people.column.status")}
            </TableHead>
            <TableHead className="h-12 w-[30%] font-normal text-muted-foreground">
              {appsHeader}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                {emptyState}
              </TableCell>
            </TableRow>
          )}
          {shown.map((person) => (
            <TableRow key={person.id}>
              <TableCell className="h-[62px] pl-5">
                <PersonCell person={person} />
              </TableCell>
              <TableCell>{person.status && <StatusBadge status={person.status} />}</TableCell>
              <TableCell className="whitespace-normal">
                {person.approvedAppNames.join(", ")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {hiddenCount > 0 && (
        <div className="border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={() => setShowsAll(true)}
            className="text-sm font-medium text-brand-deep underline underline-offset-2 hover:text-foreground"
          >
            {t("people.showMore", { count: String(hiddenCount) })}
          </button>
        </div>
      )}
    </div>
  );
}
