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
  insertCatalogApp(app: CatalogApp, status: AppStatus): Promise<App>;
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
  };
}
