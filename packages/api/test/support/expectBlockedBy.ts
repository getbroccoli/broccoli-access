import { sql } from "drizzle-orm";
import { expect } from "vitest";

import { ormOf, type Orm, type Transact } from "../../src/core/db";

/** Waits until another connection is waiting for a lock the backend `blockingPid` holds. */
export async function expectBlockedBy(orm: Orm, blockingPid: number): Promise<void> {
  await expect
    .poll(async () => {
      const { rows } = await orm.execute<{ waiting: boolean }>(sql`
        select exists (select from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'
            and ${blockingPid} = any(pg_blocking_pids(pid))) as waiting
      `);
      return rows[0]!.waiting;
    })
    .toBe(true);
}

/** Holds the real transaction open after its writes, exposing its backend PID to expectBlockedBy. */
export function holdBeforeCommit(transact: Transact) {
  const ready = Promise.withResolvers<number>();
  const release = Promise.withResolvers<void>();
  const held: Transact = (work, options) =>
    transact(async (tx) => {
      const result = await work(tx);
      const { rows } = await ormOf(tx).execute<{ pid: number }>(
        sql`select pg_backend_pid() as pid`,
      );
      ready.resolve(rows[0]!.pid);
      await release.promise;
      return result;
    }, options);
  return { transact: held, ready: ready.promise, release: release.resolve };
}
