import type { ReactNode } from "react";

/** One column of a table: its heading and how a row fills its cell. */
export interface DataTableColumn<Row> {
  id: string;
  header: string;
  cell: (row: Row) => ReactNode;
  className?: string;
}
