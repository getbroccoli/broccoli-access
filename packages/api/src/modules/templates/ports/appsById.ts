import type { Connector } from "../../../core/connectors";
import type { SecurityContext } from "../../../core/security";

/** What templates need from the apps module: an app's name, and whether the company uses it. */
export interface AppsById {
  readAppRoles(
    ctx: SecurityContext,
    appIds: readonly string[],
  ): Promise<Map<string, NonNullable<Connector["roles"]>>>;
  /** The apps with these ids; an unknown id is left out. */
  readApps(
    ctx: SecurityContext,
    appIds: readonly string[],
  ): Promise<{ id: string; name: string; status: string }[]>;
}
