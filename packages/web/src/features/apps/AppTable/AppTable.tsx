import { useState, type ReactNode } from "react";

import type { DataTableColumn } from "@/components/dataTable";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { SelectionCheckbox } from "./SelectionCheckbox";

type Props<Row extends { id: string }> = {
  rows: readonly Row[];
  /** The facts each row shows, such as a tab's facts about its apps. */
  columns: readonly DataTableColumn<Row>[];
  /** How many rows a first look needs; "Show n more" brings the rest. */
  firstRows: number;
  /** The "Show n more" link's text for `count` hidden rows. */
  showMoreLabel: (count: number) => string;
  /** Checkboxes in front of each row, when the owner selects apps. */
  selection?: {
    selected: ReadonlySet<string>;
    onChange: (selected: Set<string>) => void;
    /** The checkbox's label for a row, such as "Select Slack". */
    labelOf: (row: Row) => string;
  };
  /** Shown when there are no rows. */
  emptyState: ReactNode;
};

/**
 * A framed table of apps, of an app's users or of account changes, the first rows only until the
 * owner asks for the rest.
 */
export function AppTable<Row extends { id: string }>({
  rows,
  columns,
  firstRows,
  showMoreLabel,
  selection,
  emptyState,
}: Props<Row>) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? rows : rows.slice(0, firstRows);
  const hidden = rows.length - shown.length;
  const allSelected = selection !== undefined && rows.every(({ id }) => selection.selected.has(id));
  const toggle = (id: string) => {
    if (!selection) {
      return;
    }
    const next = new Set(selection.selected);
    if (!next.delete(id)) {
      next.add(id);
    }
    selection.onChange(next);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {selection && (
              <TableHead className="w-12 pl-5">
                <SelectionCheckbox
                  label={t("apps.selectAll")}
                  checked={rows.length > 0 && allSelected}
                  onChange={() =>
                    selection.onChange(new Set(allSelected ? [] : rows.map(({ id }) => id)))
                  }
                />
              </TableHead>
            )}
            {columns.map((column) => (
              <TableHead
                key={column.id}
                className={cn(
                  "h-12 font-normal text-muted-foreground first:pl-5 last:pr-5",
                  column.className,
                )}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={columns.length + (selection ? 1 : 0)}
                className="py-10 text-center text-muted-foreground"
              >
                {emptyState}
              </TableCell>
            </TableRow>
          )}
          {shown.map((row) => {
            const selected = selection?.selected.has(row.id) ?? false;
            return (
              <TableRow key={row.id} className={cn(selected && "bg-muted/60")}>
                {selection && (
                  <TableCell className="pl-5">
                    <SelectionCheckbox
                      label={selection.labelOf(row)}
                      checked={selected}
                      onChange={() => toggle(row.id)}
                    />
                  </TableCell>
                )}
                {columns.map((column) => (
                  <TableCell
                    key={column.id}
                    className={cn("h-[62px] first:pl-5 last:pr-5", column.className)}
                  >
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {hidden > 0 && (
        <div className="border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-sm font-medium text-brand-deep underline underline-offset-2 hover:text-foreground"
          >
            {showMoreLabel(hidden)}
          </button>
        </div>
      )}
    </div>
  );
}
