import { eq } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import type { AppStatus, CatalogApp } from "../domain";
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
  /** The app of a catalog key, locked until the transaction ends; null when missing. */
  lockByCatalogKey(catalogKey: string): Promise<App | null>;
  insertCatalogApp(app: CatalogApp, status: AppStatus): Promise<App>;
  setStatus(id: string, status: AppStatus): Promise<void>;
}

export function appRepository(db: Orm | Tx): AppRepository {
  const orm = () => ormOf(db);
  return {
    lockByCatalogKey: async (catalogKey) => {
      const [app] = await orm()
        .select()
        .from(apps)
        .where(eq(apps.catalogKey, catalogKey))
        .for("update");
      return app ?? null;
    },
    insertCatalogApp: async ({ key, name, domain, externalIds }, status) => {
      const [app] = await orm()
        .insert(apps)
        .values({ name, domain, catalogKey: key, externalIds, status })
        .returning();
      return app!;
    },
    setStatus: async (id, status) => {
      await orm().update(apps).set({ status }).where(eq(apps.id, id));
    },
  };
}
