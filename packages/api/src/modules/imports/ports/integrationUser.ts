import type { Orm, Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";

/** What the scan needs from the Google module: which directory account is the integration user. */
export interface IntegrationUser {
  /** The directory's id of the integration user; null before it exists. */
  readGoogleUserId(ctx: SecurityContext, db: Orm | Tx): Promise<string | null>;
}
