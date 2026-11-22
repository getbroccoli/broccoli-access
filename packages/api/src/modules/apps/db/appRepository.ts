import { eq } from "drizzle-orm";

import { insertBatches, type Orm, ormOf, type Tx } from "../../../core/db";
import type { AppStatus, CatalogApp, NewApp } from "../domain";
import { apps } from "./appsTable";

/** An app as stored. */
export interface App {
  id: string;
  name: string;
  domain: string | null;
  catalogKey: string | null;
  externalIds: string[];
  status: AppStatus;
  createdAt: Date;
}

/** Apps in Postgres, through the pool or inside a transaction. */
export interface AppRepository {
  insertCatalogApp(app: CatalogApp, status: AppStatus): Promise<App>;
  insertMany(apps: readonly NewApp[], status: AppStatus): Promise<App[]>;
  findAll(): Promise<App[]>;
  updateExternalIds(id: string, externalIds: readonly string[]): Promise<void>;
}

export function appRepository(db: Orm | Tx): AppRepository {
  const orm = () => ormOf(db);
  return {
    insertCatalogApp: async ({ key, name, domain, externalIds }, status) => {
      const [app] = await orm()
        .insert(apps)
        .values({ name, domain, catalogKey: key, externalIds, status })
        .returning();
      return app!;
    },
    insertMany: async (newApps, status) => {
      const inserted: App[] = [];
      for (const batch of insertBatches(newApps)) {
        const values = batch.map((app) => ({ ...app, status }));
        inserted.push(...(await orm().insert(apps).values(values).returning()));
      }
      return inserted;
    },
    findAll: () => orm().select().from(apps),
    updateExternalIds: async (id, externalIds) => {
      await orm()
        .update(apps)
        .set({ externalIds: [...externalIds] })
        .where(eq(apps.id, id));
    },
  };
}
