/** Splits rows into one batch per insert, so no insert binds more parameters than Postgres takes. */
export function insertBatches<T>(rows: readonly T[]): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < rows.length; start += ROWS_PER_INSERT) {
    batches.push(rows.slice(start, start + ROWS_PER_INSERT));
  }
  return batches;
}

/** Postgres binds at most 65,535 parameters per statement: a thousand rows of up to 65 columns. */
const ROWS_PER_INSERT = 1000;
