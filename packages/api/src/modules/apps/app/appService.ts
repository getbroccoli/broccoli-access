import type { Tx } from "../../../core/db";
import { createRecordHistoryService, type HistoryAppend } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { type App, appRepository } from "../db";
import { appChanges, type FoundApp, planAppMatches } from "../domain";

const recordHistory = createRecordHistoryService();

/** The apps the scans find. */
export interface AppService {
  /**
   * Matches each found app to an app, joining `tx`: creates the missing ones as discovered and adds
   * new external ids to known ones, appending their history with `cause`. Returns the app ids by
   * external id. System only.
   */
  matchFoundApps: (
    ctx: SecurityContext,
    tx: Tx,
    match: { found: readonly FoundApp[]; cause: HistoryAppend["cause"] },
  ) => Promise<Map<string, string>>;
}

export function createAppService(): AppService {
  return {
    async matchFoundApps(ctx, tx, { found, cause }) {
      ctx.requireSystem();
      const repository = appRepository(tx);
      const { created, updated } = planAppMatches(await repository.findAll(), found);
      const inserted = await repository.insertMany(created, "discovered");
      for (const { after } of updated) {
        await repository.updateExternalIds(after.id, after.externalIds);
      }
      await appendHistory(ctx, tx, { inserted, updated }, cause);
      return appIdsByExternalId(await repository.findAll());
    },
  };
}

/** One history line per created app and per app that gained external ids. */
async function appendHistory(
  ctx: SecurityContext,
  tx: Tx,
  {
    inserted,
    updated,
  }: { inserted: readonly App[]; updated: readonly { before: App; after: App }[] },
  cause: HistoryAppend["cause"],
): Promise<void> {
  if (inserted.length > 0) {
    await recordHistory.append(ctx, tx, {
      recordType: "app",
      operation: "CREATED",
      cause,
      records: inserted.map((app) => ({ recordId: app.id, changes: appChanges(null, app) })),
    });
  }
  if (updated.length > 0) {
    await recordHistory.append(ctx, tx, {
      recordType: "app",
      operation: "UPDATED",
      cause,
      records: updated.map(({ before, after }) => ({
        recordId: after.id,
        changes: appChanges(before, after),
      })),
    });
  }
}

function appIdsByExternalId(apps: readonly App[]): Map<string, string> {
  return new Map(
    apps.flatMap(({ id, externalIds }) => externalIds.map((externalId) => [externalId, id])),
  );
}
