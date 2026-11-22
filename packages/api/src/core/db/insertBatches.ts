/**
 * Rows for one insert each: Postgres binds at most 65,535 parameters per statement, and a thousand
 * rows stay below that with up to 65 columns.
 */
export function insertBatches<T>(rows: readonly T[]): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < rows.length; start += ROWS_PER_INSERT) {
    batches.push(rows.slice(start, start + ROWS_PER_INSERT));
  }
  return batches;
}

const ROWS_PER_INSERT = 1000;
