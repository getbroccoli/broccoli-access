import { sql } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../src/core/db";

export async function storedFileIds(db: Orm | Tx): Promise<string[]> {
  const { rows } = await ormOf(db).execute<{ id: string }>(sql`select id from files order by id`);
  return rows.map(({ id }) => id);
}
