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

import type { AppRow } from "./appRow";
import { SelectionCheckbox } from "./SelectionCheckbox";

/** How many apps show before "Show n more apps": the ones a first look needs. */
const FIRST_ROWS = 12;

type Props = {
  apps: readonly AppRow[];
  /** The tab's columns: tabs show different facts about their apps. */
  columns: readonly DataTableColumn<AppRow>[];
  /** Checkboxes in front of each app, when the owner selects apps. */
  selection?: { selected: ReadonlySet<string>; onChange: (selected: Set<string>) => void };
  /** Shown when there are no apps. */
  emptyState: ReactNode;
};

/** A framed table of apps, the first ones only until the owner asks for the rest. */
export function AppTable({ apps, columns, selection, emptyState }: Props) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? apps : apps.slice(0, FIRST_ROWS);
  const hidden = apps.length - shown.length;
  const allSelected = selection !== undefined && apps.every(({ id }) => selection.selected.has(id));
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
                  checked={apps.length > 0 && allSelected}
                  onChange={() =>
                    selection.onChange(new Set(allSelected ? [] : apps.map(({ id }) => id)))
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
          {shown.map((app) => {
            const selected = selection?.selected.has(app.id) ?? false;
            return (
              <TableRow key={app.id} className={cn(selected && "bg-muted/60")}>
                {selection && (
                  <TableCell className="pl-5">
                    <SelectionCheckbox
                      label={t("apps.select", { name: app.name })}
                      checked={selected}
                      onChange={() => toggle(app.id)}
                    />
                  </TableCell>
                )}
                {columns.map((column) => (
                  <TableCell
                    key={column.id}
                    className={cn("h-[62px] first:pl-5 last:pr-5", column.className)}
                  >
                    {column.cell(app)}
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
            {t("apps.showMore", { count: String(hidden) })}
          </button>
        </div>
      )}
    </div>
  );
}
